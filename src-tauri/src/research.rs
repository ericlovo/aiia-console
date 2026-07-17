// Research loop commands — the Console's window onto the Brain's
// /v1/research/* API (see aiia: local_brain/research/router.py).
//
// Same posture as brain.rs: all Brain HTTP goes through Rust so the frontend
// never holds the API key. Reads use brain::brain_get_optional (graceful
// None when the Brain is down); writes surface the Brain's error detail so
// the UI can show e.g. a 409 "topic already exists" message verbatim.
//
// research_run is the exception to the 3-second-timeout rule: it consumes
// the Brain's SSE stream for a whole research session (minutes) and relays
// raw chunks to the frontend as Tauri events named `research_run:{id}`,
// mirroring the keystore_call streaming contract (Chunk/Done/Error) so the
// TS side can reuse the same reassembly + SSE parsing helpers.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::brain::{brain_base_url, brain_get_optional, with_key};

/// In-flight research runs, keyed by request_id, so the UI can cancel a
/// session mid-stream. Separate from keystore::InflightCancel — Tauri manages
/// state by type, and mixing domains in one map would let a bug in one
/// surface cancel the other's calls.
pub struct ResearchInflight {
    map: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl ResearchInflight {
    pub fn new() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum StreamEvent {
    Chunk { data: String },
    Done,
    Error { message: String },
}

// ---------- reads ----------

#[tauri::command]
pub async fn research_list_topics() -> Result<Option<Value>, String> {
    brain_get_optional("/v1/research/topics").await
}

#[tauri::command]
pub async fn research_get_topic(id: String) -> Result<Option<Value>, String> {
    if id.is_empty() {
        return Err("topic id is empty".into());
    }
    brain_get_optional(&format!("/v1/research/topics/{}", encode_segment(&id))).await
}

#[tauri::command]
pub async fn research_get_synthesis(id: String) -> Result<Option<Value>, String> {
    if id.is_empty() {
        return Err("topic id is empty".into());
    }
    brain_get_optional(&format!(
        "/v1/research/topics/{}/synthesis",
        encode_segment(&id)
    ))
    .await
}

// ---------- writes ----------

/// POST to the Brain and surface its error `detail` on non-2xx, so the UI can
/// show the Brain's own words ("Topic for Erdős problem #42 already exists").
async fn brain_post(path: &str, body: Value) -> Result<Value, String> {
    let url = format!("{}{}", brain_base_url(), path);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("brain client init failed: {}", e))?;
    let resp = with_key(client.post(&url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("brain unreachable: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(String::from))
            .unwrap_or(text);
        return Err(format!("{}", detail.chars().take(400).collect::<String>()));
    }
    resp.json::<Value>()
        .await
        .map_err(|e| format!("brain json parse failed: {}", e))
}

#[tauri::command]
pub async fn research_create_topic(
    title: String,
    question: String,
    seeds: Vec<String>,
    profile: String,
) -> Result<Value, String> {
    if title.trim().is_empty() || question.trim().is_empty() {
        return Err("title and question are required".into());
    }
    brain_post(
        "/v1/research/topics",
        json!({ "title": title, "question": question, "seeds": seeds, "profile": profile }),
    )
    .await
}

#[tauri::command]
pub async fn research_create_erdos(number: u32, seeds: Vec<String>) -> Result<Value, String> {
    if number == 0 {
        return Err("Erdős problem number must be positive".into());
    }
    brain_post(
        "/v1/research/erdos",
        json!({ "number": number, "seeds": seeds }),
    )
    .await
}

#[tauri::command]
pub async fn research_create_literature(
    subject: String,
    seeds: Vec<String>,
) -> Result<Value, String> {
    if subject.trim().is_empty() {
        return Err("subject is required".into());
    }
    brain_post(
        "/v1/research/literature",
        json!({ "subject": subject, "seeds": seeds }),
    )
    .await
}

// ---------- the run stream ----------

#[tauri::command]
pub async fn research_run(
    app: AppHandle,
    state: tauri::State<'_, ResearchInflight>,
    request_id: String,
    topic_id: String,
) -> Result<(), String> {
    let event_name = format!("research_run:{}", request_id);

    if topic_id.is_empty() {
        let msg = "topic id is empty".to_string();
        let _ = app.emit(&event_name, StreamEvent::Error { message: msg.clone() });
        return Err(msg);
    }

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    {
        let mut map = state.map.lock().map_err(|e| e.to_string())?;
        map.insert(request_id.clone(), cancel_tx);
    }

    let result = tokio::select! {
        _ = &mut cancel_rx => {
            let _ = app.emit(&event_name, StreamEvent::Error { message: "cancelled".into() });
            let mut map = state.map.lock().map_err(|e| e.to_string())?;
            map.remove(&request_id);
            return Ok(());
        }
        r = stream_run(&app, &event_name, &topic_id) => r,
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
            let _ = app.emit(&event_name, StreamEvent::Error { message: e.clone() });
            Err(e)
        }
    }
}

#[tauri::command]
pub fn research_run_cancel(
    state: tauri::State<'_, ResearchInflight>,
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

async fn stream_run(app: &AppHandle, event_name: &str, topic_id: &str) -> Result<(), String> {
    let url = format!(
        "{}/v1/research/topics/{}/run",
        brain_base_url(),
        encode_segment(topic_id)
    );
    // No overall timeout: a session legitimately runs for minutes. The
    // connect timeout still catches an unreachable Brain quickly.
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http client init: {}", e))?;

    let resp = with_key(client.post(&url))
        .send()
        .await
        .map_err(|e| format!("brain unreachable: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(String::from))
            .unwrap_or(text);
        return Err(format!(
            "HTTP {}: {}",
            status,
            detail.chars().take(400).collect::<String>()
        ));
    }

    let mut stream = resp.bytes_stream();
    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| format!("stream read: {}", e))?;
        let text = String::from_utf8_lossy(&bytes).to_string();
        if text.is_empty() {
            continue;
        }
        let _ = app.emit(event_name, StreamEvent::Chunk { data: text });
    }
    Ok(())
}

// Topic ids are short uuid prefixes today, but encode defensively.
fn encode_segment(s: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_segment_passthrough() {
        assert_eq!(encode_segment("abc-123"), "abc-123");
    }

    #[test]
    fn encode_segment_escapes() {
        assert_eq!(encode_segment("a b/c"), "a%20b%2Fc");
    }
}
