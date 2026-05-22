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

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const DEFAULT_BRAIN_URL: &str = "http://127.0.0.1:8100";
const BRAIN_TIMEOUT_SECS: u64 = 3;

fn brain_base_url() -> String {
    std::env::var("AIIA_BRAIN_URL").unwrap_or_else(|_| DEFAULT_BRAIN_URL.to_string())
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
    let resp = match client.get(&url).send().await {
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
    let resp = client
        .post(&url)
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
    let resp = client
        .delete(&url)
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
    let resp = match client.post(&url).json(&body).send().await {
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
