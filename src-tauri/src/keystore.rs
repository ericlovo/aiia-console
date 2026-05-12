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
    for k in ["anthropic", "openai", "moonshot", "deepseek", "google"] {
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
