// API key storage + streaming HTTP proxy for remote model providers.
//
// Keys live in ~/.aiia/keys.json (0600), directory 0700. The JS layer can
// only ask whether a key is present (keystore_get_keys), set/clear a value
// (keystore_set_key, keystore_delete_key), or invoke an outbound streaming
// call (keystore_call) — never read the plaintext value back.
//
// keystore_call signs the request with the configured key inside Rust and
// streams response bytes back to the JS layer as Tauri events keyed by a
// per-call request_id. The body of each `chunk` event is a utf-8 string of
// raw response bytes (already utf-8 since every supported provider returns
// SSE/NDJSON text). JS parses framing on its side via the keystoreStream
// helper.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::home;

fn aiia_dir() -> Result<PathBuf, String> {
    Ok(home()?.join(".aiia"))
}

fn keys_path() -> Result<PathBuf, String> {
    Ok(aiia_dir()?.join("keys.json"))
}

#[cfg(unix)]
fn chmod(path: &std::path::Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let perms = fs::Permissions::from_mode(mode);
    fs::set_permissions(path, perms)
}

#[cfg(not(unix))]
fn chmod(_path: &std::path::Path, _mode: u32) -> std::io::Result<()> {
    Ok(())
}

fn ensure_dir() -> Result<PathBuf, String> {
    let dir = aiia_dir()?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("mkdir ~/.aiia failed: {}", e))?;
        let _ = chmod(&dir, 0o700);
    }
    Ok(dir)
}

fn load_keys() -> Result<HashMap<String, String>, String> {
    let path = keys_path()?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read keys.json: {}", e))?;
    let parsed: HashMap<String, String> = serde_json::from_str(&raw)
        .map_err(|e| format!("parse keys.json: {}", e))?;
    Ok(parsed)
}

fn save_keys(map: &HashMap<String, String>) -> Result<(), String> {
    ensure_dir()?;
    let path = keys_path()?;
    let body = serde_json::to_string_pretty(map)
        .map_err(|e| format!("serialize keys.json: {}", e))?;
    fs::write(&path, body).map_err(|e| format!("write keys.json: {}", e))?;
    let _ = chmod(&path, 0o600);
    Ok(())
}

// ---- public commands ----

#[tauri::command]
pub fn keystore_get_keys() -> Result<HashMap<String, bool>, String> {
    let keys = load_keys()?;
    let mut out = HashMap::new();
    for k in ["anthropic", "openai", "moonshot", "deepseek", "google", "groq"] {
        out.insert(
            k.to_string(),
            keys.get(k).map(|v| !v.is_empty()).unwrap_or(false),
        );
    }
    // Also surface any extras already on disk (forward-compat).
    for (k, v) in &keys {
        out.entry(k.clone()).or_insert(!v.is_empty());
    }
    Ok(out)
}

#[tauri::command]
pub fn keystore_set_key(provider: String, key: String) -> Result<(), String> {
    if provider.is_empty() {
        return Err("provider is empty".into());
    }
    let mut keys = load_keys().unwrap_or_default();
    keys.insert(provider, key);
    save_keys(&keys)
}

#[tauri::command]
pub fn keystore_delete_key(provider: String) -> Result<(), String> {
    let mut keys = load_keys().unwrap_or_default();
    keys.remove(&provider);
    save_keys(&keys)
}

// ---- streaming proxy ----

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct KeystoreCallArgs {
    pub request_id: String,
    pub provider: String,
    pub url: String,
    pub body: Value,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StreamEvent {
    Chunk { data: String },
    Done,
    Error { message: String },
}

/// Map provider id -> (header name, value template). The `{key}` placeholder
/// is replaced with the stored API key. Anthropic uses x-api-key, Google
/// appends ?key= to the URL, everyone else uses Bearer.
fn auth_for(provider: &str, key: &str) -> AuthSpec {
    match provider {
        "anthropic" => AuthSpec::Header("x-api-key".into(), key.into()),
        "google" => AuthSpec::Query("key".into(), key.into()),
        _ => AuthSpec::Header("authorization".into(), format!("Bearer {}", key)),
    }
}

enum AuthSpec {
    Header(String, String),
    Query(String, String),
}

/// Per-provider allowlist of acceptable HTTP host suffixes. `keystore_call`
/// will refuse to attach the stored API key to a URL whose host doesn't end
/// in one of these suffixes. Defense-in-depth: even if a JS-side bug or
/// compromise builds a malicious URL, the Rust layer won't sign it.
///
/// Suffix matching (not exact) so subdomains under the provider's domain
/// (e.g. regional endpoints) still work without re-deploying the app.
/// To add a new provider, add the entry here and to `auth_for` above.
fn allowed_hosts(provider: &str) -> &'static [&'static str] {
    match provider {
        "anthropic" => &["api.anthropic.com"],
        "openai" => &["api.openai.com"],
        "moonshot" => &["api.moonshot.ai", "api.moonshot.cn"],
        "deepseek" => &["api.deepseek.com"],
        // Google's GenAI endpoint is on generativelanguage.googleapis.com;
        // *.googleapis.com is intentionally narrower than `*.google.com`
        // to keep the blast radius small if a JS bug ever constructs a
        // URL pointing at e.g. analytics.google.com.
        "google" => &["generativelanguage.googleapis.com"],
        // Groq serves both chat completions (OpenAI-compatible) and
        // Whisper transcriptions from api.groq.com.
        "groq" => &["api.groq.com"],
        _ => &[],
    }
}

/// Validate that `url` is HTTPS and its host is in the provider's allowlist.
/// Returns a descriptive error string on rejection (suitable for surfacing
/// to the JS layer).
fn check_url_allowed(provider: &str, url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid url: {}", e))?;

    // Block file:, data:, custom: schemes — only HTTPS to remote APIs.
    if parsed.scheme() != "https" {
        return Err(format!(
            "keystore_call rejects non-https url scheme '{}'; only https is allowed",
            parsed.scheme()
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "url has no host".to_string())?;

    let allowlist = allowed_hosts(provider);
    if allowlist.is_empty() {
        return Err(format!(
            "keystore_call has no host allowlist configured for provider '{}'",
            provider
        ));
    }

    let host_lower = host.to_lowercase();
    let allowed = allowlist
        .iter()
        .any(|suffix| host_lower == *suffix || host_lower.ends_with(&format!(".{}", suffix)));

    if !allowed {
        return Err(format!(
            "keystore_call refuses to attach the {} api key to host '{}' (not in allowlist {:?})",
            provider, host, allowlist
        ));
    }

    Ok(())
}

/// Tracks in-flight requests so JS can cancel them.
pub struct InflightCancel {
    pub map: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl InflightCancel {
    pub fn new() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub async fn keystore_call(
    app: AppHandle,
    state: tauri::State<'_, InflightCancel>,
    request_id: String,
    provider: String,
    url: String,
    body: Value,
    headers: Option<HashMap<String, String>>,
) -> Result<(), String> {
    // Reject obviously-malicious URLs before doing anything with the key.
    // This is defense-in-depth: even if the JS layer is compromised or has
    // a bug that builds a URL pointing at attacker-controlled infrastructure,
    // the Rust layer won't sign it with the user's API key.
    if let Err(e) = check_url_allowed(&provider, &url) {
        emit_error(&app, &request_id, e.clone());
        return Err(e);
    }

    let keys = load_keys().unwrap_or_default();
    let api_key = match keys.get(&provider) {
        Some(v) if !v.is_empty() => v.clone(),
        _ => {
            emit_error(&app, &request_id, format!("no api key configured for {}", provider));
            return Err(format!("no api key for provider {}", provider));
        }
    };

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    {
        let mut map = state.map.lock().map_err(|e| e.to_string())?;
        map.insert(request_id.clone(), cancel_tx);
    }

    let event_name = format!("keystore_call:{}", request_id);

    let result = tokio::select! {
        _ = &mut cancel_rx => {
            emit_error(&app, &request_id, "cancelled".to_string());
            return Ok(());
        }
        r = do_stream(&app, &event_name, &provider, &api_key, &url, &body, headers.as_ref()) => r,
    };

    {
        let mut map = state.map.lock().map_err(|e| e.to_string())?;
        map.remove(&request_id);
    }

    match result {
        Ok(()) => {
            let _ = app.emit(&event_name, StreamEvent::Done);
            Ok(())
        }
        Err(e) => {
            emit_error(&app, &request_id, e.clone());
            Err(e)
        }
    }
}

#[tauri::command]
pub fn keystore_call_cancel(
    state: tauri::State<'_, InflightCancel>,
    request_id: String,
) -> Result<(), String> {
    let tx = {
        let mut map = state.map.lock().map_err(|e| e.to_string())?;
        map.remove(&request_id)
    };
    if let Some(tx) = tx {
        let _ = tx.send(());
    }
    Ok(())
}

fn emit_error(app: &AppHandle, request_id: &str, message: String) {
    let event_name = format!("keystore_call:{}", request_id);
    let _ = app.emit(&event_name, StreamEvent::Error { message });
}

async fn do_stream(
    app: &AppHandle,
    event_name: &str,
    provider: &str,
    api_key: &str,
    url: &str,
    body: &Value,
    extra_headers: Option<&HashMap<String, String>>,
) -> Result<(), String> {
    let auth = auth_for(provider, api_key);
    let mut final_url = url.to_string();

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("http client init: {}", e))?;

    let mut req = client.post(&final_url);

    // Apply caller-supplied headers first (content-type, etc.).
    if let Some(h) = extra_headers {
        for (k, v) in h {
            req = req.header(k.as_str(), v.as_str());
        }
    }

    // Apply auth.
    match auth {
        AuthSpec::Header(name, value) => {
            req = req.header(name.as_str(), value.as_str());
        }
        AuthSpec::Query(name, value) => {
            // Re-build the URL with the key appended.
            let sep = if final_url.contains('?') { '&' } else { '?' };
            final_url = format!(
                "{}{}{}={}",
                final_url,
                sep,
                name,
                urlencoding_minimal(&value)
            );
            req = client.post(&final_url);
            if let Some(h) = extra_headers {
                for (k, v) in h {
                    req = req.header(k.as_str(), v.as_str());
                }
            }
        }
    }

    let req = req.json(body);

    let resp = req.send().await.map_err(|e| format!("http send: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text.chars().take(400).collect::<String>()));
    }

    let mut stream = resp.bytes_stream();
    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| format!("stream read: {}", e))?;
        // Pass bytes through as utf-8. Lossy decoding keeps us alive even if a
        // chunk lands mid-codepoint (next chunk will complete it from JS's
        // perspective via re-assembly of consecutive deltas).
        let text = String::from_utf8_lossy(&bytes).to_string();
        if text.is_empty() {
            continue;
        }
        let _ = app.emit(event_name, StreamEvent::Chunk { data: text });
    }
    Ok(())
}

/// Tiny percent-encoder for the few characters we expect in API keys when
/// they're carried in a query string (Google). Avoids pulling in a full
/// urlencoding crate.
fn urlencoding_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        let safe = b.is_ascii_alphanumeric()
            || matches!(b, b'-' | b'_' | b'.' | b'~');
        if safe {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

// ---- audio transcription (Whisper-style multipart) ----
//
// keystore_call streams JSON-bodied requests (SSE/NDJSON responses). Whisper
// needs a multipart file upload and returns a single JSON document. This is
// a separate command tailored for that shape.
//
// Currently supports Groq's OpenAI-compatible /audio/transcriptions endpoint.
// Other providers (OpenAI Whisper, Deepgram) drop in with one match arm each.

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct TranscribeArgs {
    pub provider: String,
    pub model: String,
    /// Raw audio bytes (browser MediaRecorder output, base64-encoded by the JS
    /// side because Tauri's JSON IPC can't carry raw binary).
    pub audio_base64: String,
    /// MIME type of the audio (e.g. "audio/webm", "audio/mp4").
    pub content_type: String,
    /// Optional ISO-639-1 language hint (e.g. "en").
    pub language: Option<String>,
}

fn transcription_url(provider: &str) -> Result<&'static str, String> {
    match provider {
        "groq" => Ok("https://api.groq.com/openai/v1/audio/transcriptions"),
        // OpenAI Whisper proper:
        // "openai" => Ok("https://api.openai.com/v1/audio/transcriptions"),
        _ => Err(format!("transcription not supported for provider '{}'", provider)),
    }
}

fn extension_for(content_type: &str) -> &'static str {
    match content_type {
        "audio/webm" => "webm",
        "audio/ogg" => "ogg",
        "audio/mp4" | "audio/m4a" => "m4a",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/wav" | "audio/wave" | "audio/x-wav" => "wav",
        "audio/flac" => "flac",
        _ => "bin",
    }
}

#[tauri::command]
pub async fn keystore_transcribe(args: TranscribeArgs) -> Result<String, String> {
    let url = transcription_url(&args.provider)?;
    check_url_allowed(&args.provider, url)?;

    let keys = load_keys().unwrap_or_default();
    let api_key = match keys.get(&args.provider) {
        Some(v) if !v.is_empty() => v.clone(),
        _ => return Err(format!("no api key configured for {}", args.provider)),
    };

    let bytes = base64_decode_standard(&args.audio_base64)
        .map_err(|e| format!("audio_base64 decode: {}", e))?;
    let filename = format!("recording.{}", extension_for(&args.content_type));

    let mut form = reqwest::multipart::Form::new()
        .text("model", args.model.clone())
        .text("response_format", "json".to_string());
    if let Some(lang) = args.language.as_deref() {
        if !lang.is_empty() {
            form = form.text("language", lang.to_string());
        }
    }
    let file_part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(&args.content_type)
        .map_err(|e| format!("invalid mime: {}", e))?;
    form = form.part("file", file_part);

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("http client init: {}", e))?;

    let resp = client
        .post(url)
        .header("authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("http send: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            status,
            text.chars().take(400).collect::<String>()
        ));
    }

    // Both Groq and OpenAI return {"text": "..."} when response_format=json.
    let parsed: Value = serde_json::from_str(&text)
        .map_err(|e| format!("transcription json parse: {} (body: {})", e, &text[..text.len().min(200)]))?;
    let transcript = parsed
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "transcription response missing 'text' field".to_string())?;
    Ok(transcript.to_string())
}

/// Standard-alphabet base64 decoder. Avoids pulling in the `base64` crate for
/// the one place we need it. Tolerates whitespace and trailing '=' padding.
fn base64_decode_standard(s: &str) -> Result<Vec<u8>, String> {
    const TABLE: [i8; 128] = {
        let mut t = [-1i8; 128];
        let mut i = 0u8;
        while i < 26 {
            t[(b'A' + i) as usize] = i as i8;
            t[(b'a' + i) as usize] = (i + 26) as i8;
            i += 1;
        }
        let mut j = 0u8;
        while j < 10 {
            t[(b'0' + j) as usize] = (j + 52) as i8;
            j += 1;
        }
        t[b'+' as usize] = 62;
        t[b'/' as usize] = 63;
        t
    };

    let mut buf = [0u8; 4];
    let mut nbuf = 0usize;
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    for byte in s.bytes() {
        if byte.is_ascii_whitespace() {
            continue;
        }
        if byte == b'=' {
            break;
        }
        if byte >= 128 {
            return Err(format!("invalid byte: 0x{:02x}", byte));
        }
        let v = TABLE[byte as usize];
        if v < 0 {
            return Err(format!("invalid base64 byte: 0x{:02x}", byte));
        }
        buf[nbuf] = v as u8;
        nbuf += 1;
        if nbuf == 4 {
            out.push((buf[0] << 2) | (buf[1] >> 4));
            out.push((buf[1] << 4) | (buf[2] >> 2));
            out.push((buf[2] << 6) | buf[3]);
            nbuf = 0;
        }
    }
    match nbuf {
        0 => Ok(out),
        2 => {
            out.push((buf[0] << 2) | (buf[1] >> 4));
            Ok(out)
        }
        3 => {
            out.push((buf[0] << 2) | (buf[1] >> 4));
            out.push((buf[1] << 4) | (buf[2] >> 2));
            Ok(out)
        }
        _ => Err("truncated base64".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_official_host_is_allowed() {
        assert!(check_url_allowed("anthropic", "https://api.anthropic.com/v1/messages").is_ok());
    }

    #[test]
    fn openai_official_host_is_allowed() {
        assert!(check_url_allowed("openai", "https://api.openai.com/v1/chat/completions").is_ok());
    }

    #[test]
    fn google_genai_host_is_allowed() {
        assert!(check_url_allowed(
            "google",
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent"
        )
        .is_ok());
    }

    #[test]
    fn subdomains_of_allowed_host_are_allowed() {
        // e.g. regional or beta endpoint — still under the provider's domain.
        assert!(
            check_url_allowed("anthropic", "https://eu.api.anthropic.com/v1/messages").is_ok()
        );
    }

    #[test]
    fn http_scheme_is_rejected() {
        let err = check_url_allowed("anthropic", "http://api.anthropic.com/v1/messages")
            .expect_err("http should be rejected");
        assert!(err.contains("https"));
    }

    #[test]
    fn file_scheme_is_rejected() {
        let err = check_url_allowed("anthropic", "file:///etc/passwd")
            .expect_err("file scheme should be rejected");
        assert!(err.contains("https") || err.contains("scheme"));
    }

    #[test]
    fn attacker_host_is_rejected() {
        let err = check_url_allowed("anthropic", "https://attacker.com/log?k=")
            .expect_err("foreign host should be rejected");
        assert!(err.contains("attacker.com"));
        assert!(err.contains("allowlist"));
    }

    #[test]
    fn google_main_domain_is_rejected() {
        // Narrower than *.google.com — we only want generativelanguage.googleapis.com.
        let err = check_url_allowed("google", "https://analytics.google.com/log")
            .expect_err("google.com is not in the genai allowlist");
        assert!(err.contains("allowlist"));
    }

    #[test]
    fn unknown_provider_is_rejected() {
        let err = check_url_allowed("evil-provider", "https://api.openai.com/v1/chat/completions")
            .expect_err("unknown provider should have empty allowlist");
        assert!(err.contains("allowlist") || err.contains("provider"));
    }

    #[test]
    fn malformed_url_is_rejected() {
        let err = check_url_allowed("anthropic", "not a url")
            .expect_err("malformed url should be rejected");
        assert!(err.contains("invalid url") || err.contains("scheme"));
    }

    #[test]
    fn groq_official_host_is_allowed() {
        assert!(check_url_allowed("groq", "https://api.groq.com/openai/v1/chat/completions").is_ok());
        assert!(check_url_allowed("groq", "https://api.groq.com/openai/v1/audio/transcriptions").is_ok());
    }

    #[test]
    fn groq_foreign_host_is_rejected() {
        let err = check_url_allowed("groq", "https://attacker.com/log")
            .expect_err("foreign host should be rejected");
        assert!(err.contains("allowlist"));
    }

    #[test]
    fn base64_decode_basic() {
        // "AIIA" → 4 bytes
        let decoded = base64_decode_standard("QUlJQQ==").unwrap();
        assert_eq!(decoded, b"AIIA");
    }

    #[test]
    fn base64_decode_no_padding() {
        let decoded = base64_decode_standard("QUlJQQ").unwrap();
        assert_eq!(decoded, b"AIIA");
    }

    #[test]
    fn base64_decode_with_whitespace() {
        // Embedded whitespace should be tolerated (FormData encoders sometimes
        // insert newlines).
        let decoded = base64_decode_standard("QUlJ\nQQ==").unwrap();
        assert_eq!(decoded, b"AIIA");
    }
}
