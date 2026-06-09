// AIIA Brain client.
//
// All outbound HTTP to the local AIIA Brain is funneled through here so the
// frontend never talks to the Brain via `fetch`. This matches the security
// posture of the keystore: everything off-process goes through Rust, where we
// can apply timeouts, sanitize errors, and (eventually) inject auth.
//
// The Brain is assumed to be running at http://127.0.0.1:8100 by default;
// override with the `AIIA_BRAIN_URL` env var.
//
// Behavior contract:
//   * 3-second per-call timeout.
//   * Network/5xx errors return `Ok(None)` (or `Err` for the write paths)
//     so the UI can render a graceful "Brain not detected" state instead of
//     crashing.
//   * `serde_json::Value` is used for response bodies so the UI is not
//     coupled to a single Brain schema version — we pass through whatever the
//     Brain returns and let the TS side bind to the fields it actually uses.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const DEFAULT_BRAIN_URL: &str = "http://127.0.0.1:8100";
const BRAIN_TIMEOUT_SECS: u64 = 3;

/// Non-secret console settings (the Brain URL) live here, separate from the
/// secret keystore (keys.json). The Brain API key, being a secret, is stored in
/// the keystore under the id "brain". Both share the platform config dir
/// (~/.aiia on desktop, the app sandbox on mobile — see crate::aiia_config_dir).
fn console_config_path() -> Result<PathBuf, String> {
    Ok(crate::aiia_config_dir().join("console.json"))
}

/// The Brain URL the user has saved in Settings, if any (trimmed, non-empty).
fn saved_brain_url() -> Option<String> {
    let raw = fs::read_to_string(console_config_path().ok()?).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    v.get("brain_url")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Resolve the effective Brain base URL. Precedence: saved Settings value,
/// then the AIIA_BRAIN_URL env override, then the localhost default. Any
/// trailing slash is stripped so callers can concatenate "/v1/..." paths.
fn brain_base_url() -> String {
    let url = saved_brain_url()
        .or_else(|| std::env::var("AIIA_BRAIN_URL").ok())
        .unwrap_or_else(|| DEFAULT_BRAIN_URL.to_string());
    url.trim_end_matches('/').to_string()
}

/// The key used to authenticate to a remote Brain (sent as `x-api-key`), if the
/// user has configured one. A local Brain with no LOCAL_BRAIN_API_KEY set
/// ignores the header, so sending it is always safe.
fn brain_api_key() -> Option<String> {
    crate::keystore::get_key("brain")
}

/// Attach the Brain API key header to a request if one is configured.
fn with_key(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match brain_api_key() {
        Some(k) => req.header("x-api-key", k),
        None => req,
    }
}

fn brain_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(BRAIN_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("brain client init failed: {}", e))
}

/// Internal helper: returns `Ok(None)` for any transport/timeout/5xx error,
/// `Ok(Some(value))` for 2xx, and `Err` only when the URL itself is malformed
/// (programmer error).
async fn brain_get_optional(path: &str) -> Result<Option<Value>, String> {
    let url = format!("{}{}", brain_base_url(), path);
    let client = match brain_client() {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    let resp = match with_key(client.get(&url)).send().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if !resp.status().is_success() {
        return Ok(None);
    }
    match resp.json::<Value>().await {
        Ok(v) => Ok(Some(v)),
        Err(_) => Ok(None),
    }
}

#[derive(Serialize, Deserialize)]
pub struct RememberRequest {
    pub fact: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

// ---------- commands ----------

#[tauri::command]
pub async fn brain_status() -> Result<Option<Value>, String> {
    brain_get_optional("/v1/aiia/status").await
}

#[tauri::command]
pub async fn brain_list_memories(
    category: Option<String>,
    limit: Option<u32>,
) -> Result<Option<Value>, String> {
    let mut params: Vec<(String, String)> = Vec::new();
    if let Some(c) = category {
        if !c.is_empty() && c != "all" {
            params.push(("category".into(), c));
        }
    }
    if let Some(n) = limit {
        params.push(("limit".into(), n.to_string()));
    }
    let qs = if params.is_empty() {
        String::new()
    } else {
        let pairs: Vec<String> = params
            .iter()
            .map(|(k, v)| {
                format!(
                    "{}={}",
                    urlencode_minimal(k),
                    urlencode_minimal(v)
                )
            })
            .collect();
        format!("?{}", pairs.join("&"))
    };
    let path = format!("/v1/aiia/memory{}", qs);
    brain_get_optional(&path).await
}

#[tauri::command]
pub async fn brain_get_memory(id: String) -> Result<Option<Value>, String> {
    if id.is_empty() {
        return Err("memory id is empty".into());
    }
    // The Brain (today) has no single-memory GET, so derive from the list.
    let list = match brain_list_memories(None, None).await? {
        Some(v) => v,
        None => return Ok(None),
    };
    let arr = match list.get("memories").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Ok(None),
    };
    for m in arr {
        if m.get("id").and_then(|v| v.as_str()) == Some(id.as_str()) {
            return Ok(Some(m.clone()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn brain_remember(
    fact: String,
    category: Option<String>,
    source: Option<String>,
    metadata: Option<Value>,
) -> Result<Value, String> {
    if fact.trim().is_empty() {
        return Err("fact is empty".into());
    }
    let body = RememberRequest {
        fact,
        category,
        source,
        metadata,
    };
    let url = format!("{}/v1/aiia/remember", brain_base_url());
    let client = brain_client()?;
    let resp = with_key(client.post(&url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("brain unreachable: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("brain returned {}: {}", status, text));
    }
    resp.json::<Value>()
        .await
        .map_err(|e| format!("brain json parse failed: {}", e))
}

#[tauri::command]
pub async fn brain_forget(id: String) -> Result<bool, String> {
    if id.is_empty() {
        return Err("memory id is empty".into());
    }
    let url = format!(
        "{}/v1/aiia/memory/{}",
        brain_base_url(),
        urlencode_path_segment(&id)
    );
    let client = brain_client()?;
    let resp = with_key(client.delete(&url))
        .send()
        .await
        .map_err(|e| format!("brain unreachable: {}", e))?;
    Ok(resp.status().is_success())
}

#[tauri::command]
pub async fn brain_search(
    query: String,
    n_results: Option<u32>,
    include_sessions: Option<bool>,
) -> Result<Option<Value>, String> {
    if query.trim().is_empty() {
        return Ok(Some(json!({ "results": [], "count": 0 })));
    }
    let url = format!("{}/v1/aiia/search", brain_base_url());
    let body = json!({
        "question": query,
        "n_results": n_results.unwrap_or(20),
        "include_sessions": include_sessions.unwrap_or(false),
    });
    let client = match brain_client() {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    let resp = match with_key(client.post(&url)).json(&body).send().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if !resp.status().is_success() {
        return Ok(None);
    }
    match resp.json::<Value>().await {
        Ok(v) => Ok(Some(v)),
        Err(_) => Ok(None),
    }
}

// ---------- connection settings ----------

/// Return the effective Brain base URL (saved value, env override, or default)
/// so the Settings UI can show what the app will actually talk to.
#[tauri::command]
pub fn brain_get_url() -> Result<String, String> {
    Ok(brain_base_url())
}

/// Persist the Brain base URL into ~/.aiia/console.json. An empty string clears
/// the saved value (falling back to the env/default). Other keys in the file
/// are preserved.
#[tauri::command]
pub fn brain_set_url(url: String) -> Result<(), String> {
    let dir = crate::aiia_config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir config dir failed: {}", e))?;
    let path = dir.join("console.json");

    let mut obj = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    let trimmed = url.trim();
    if trimmed.is_empty() {
        obj.remove("brain_url");
    } else {
        obj.insert("brain_url".into(), Value::String(trimmed.to_string()));
    }

    let body = serde_json::to_string_pretty(&Value::Object(obj))
        .map_err(|e| format!("serialize console.json: {}", e))?;
    fs::write(&path, body).map_err(|e| format!("write console.json: {}", e))?;
    Ok(())
}

// Minimal percent-encoding for query string values. We only need to handle a
// small set of characters since categories are short ASCII strings; for the
// general case we'd reach for the `urlencoding` crate, but adding a dep just
// for this isn't justified.
fn urlencode_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => out.push(c),
            _ => {
                let mut buf = [0u8; 4];
                for b in c.encode_utf8(&mut buf).bytes() {
                    out.push_str(&format!("%{:02X}", b));
                }
            }
        }
    }
    out
}

fn urlencode_path_segment(s: &str) -> String {
    // Same conservative set; path segments accept the same unreserved chars.
    urlencode_minimal(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencode_passthrough_alnum() {
        assert_eq!(urlencode_minimal("abc-XYZ_123.~"), "abc-XYZ_123.~");
    }

    #[test]
    fn urlencode_escapes_special() {
        assert_eq!(urlencode_minimal("a b/c?"), "a%20b%2Fc%3F");
    }
}
