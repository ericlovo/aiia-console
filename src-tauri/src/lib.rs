// Tauri commands for the AIIA Console.
// All filesystem writes are confined to ~/AIIA. Gateway config is read from
// ~/.openclaw/openclaw.json so the frontend can authenticate to the local
// OpenClaw gateway without env vars.

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use serde::Serialize;
use serde_json::Value;

mod brain;
mod keystore;
mod loops;
use brain::{
    brain_forget, brain_get_memory, brain_get_url, brain_list_memories, brain_remember,
    brain_search, brain_set_url, brain_status,
};
use keystore::{
    keystore_call, keystore_call_cancel, keystore_delete_key, keystore_get_keys,
    keystore_set_key, keystore_transcribe, InflightCancel,
};
use loops::{
    loop_adapters_available, loop_belief, loop_create, loop_escalations, loop_generate_cases,
    loop_is_running, loop_launch, loop_list_instances, loop_status, loop_stop, loop_tail_log,
};

// ---------- shared path helpers ----------

pub fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())
}

// Base directory for AIIA console config + secrets (keys.json, console.json).
//
// Desktop resolves to ~/.aiia (unchanged). Mobile (iOS/iPadOS, Android) has no
// ~/.aiia, so `run()`'s setup hook sets this to the app's sandbox data dir at
// startup. Reads fall back to ~/.aiia when unset, keeping desktop behavior
// byte-identical and tests working without a Tauri app handle.
static AIIA_CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn aiia_config_dir() -> PathBuf {
    if let Some(p) = AIIA_CONFIG_DIR.get() {
        return p.clone();
    }
    home()
        .map(|h| h.join(".aiia"))
        .unwrap_or_else(|_| PathBuf::from(".aiia"))
}

#[cfg(mobile)]
fn set_aiia_config_dir(p: PathBuf) {
    let _ = AIIA_CONFIG_DIR.set(p);
}

/// Expand a leading `~/` into the home directory. Used for env-supplied paths.
fn expand_tilde(s: &str) -> PathBuf {
    if let Some(stripped) = s.strip_prefix("~/") {
        if let Ok(h) = home() {
            return h.join(stripped);
        }
    }
    if s == "~" {
        if let Ok(h) = home() {
            return h;
        }
    }
    PathBuf::from(s)
}

/// Resolve the vault root. Mirrors local_brain/vault_paths.py in the AIIA
/// Brain so a single OBSIDIAN_VAULT_DIR setting routes both the brain and the
/// console at the same Obsidian vault.
///
/// Order:
///   1. OBSIDIAN_VAULT_DIR env var (preferred)
///   2. ~/Documents/AIIA  (standard Obsidian-friendly location, if it exists)
///   3. ~/AIIA            (legacy console default, if it exists — backwards
///                         compatible for users who set this up before the
///                         brain's vault layer existed)
///   4. ~/.aiia/vault     (hidden fallback, created lazily by writers)
fn aiia_root() -> Result<PathBuf, String> {
    if let Ok(v) = std::env::var("OBSIDIAN_VAULT_DIR") {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            return Ok(expand_tilde(trimmed));
        }
    }
    let h = home()?;
    let docs = h.join("Documents").join("AIIA");
    if docs.exists() {
        return Ok(docs);
    }
    let legacy = h.join("AIIA");
    if legacy.exists() {
        return Ok(legacy);
    }
    Ok(h.join(".aiia").join("vault"))
}

/// Resolve a vault-relative path and guarantee it stays inside ~/AIIA.
/// Accepts strings with or without a leading "AIIA/" prefix. Rejects empty,
/// absolute, or traversal paths.
fn vault_path(rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() {
        return Err("vault path is empty".into());
    }
    if rel.starts_with('/') {
        return Err(format!("absolute paths not allowed: {}", rel));
    }
    if rel.split(['/', '\\']).any(|seg| seg == ".." || seg.is_empty() && rel != "/") {
        return Err(format!("traversal not allowed: {}", rel));
    }
    let trimmed = rel.strip_prefix("AIIA/").unwrap_or(rel);
    let root = aiia_root()?;
    // Lazy-create the vault root so the hidden-fallback case (~/.aiia/vault)
    // and a fresh OBSIDIAN_VAULT_DIR self-bootstrap on first write.
    fs::create_dir_all(&root)
        .map_err(|e| format!("mkdir vault root failed: {} ({})", root.display(), e))?;
    let joined = root.join(trimmed);

    // Canonicalize when possible to catch symlink escapes; fall back when the
    // file doesn't exist yet (writes).
    let canon = match joined.canonicalize() {
        Ok(c) => c,
        Err(_) => {
            // Canonicalize the parent so we still verify containment for writes.
            let parent = joined
                .parent()
                .ok_or_else(|| "could not resolve parent".to_string())?;
            let parent_canon = parent
                .canonicalize()
                .map_err(|e| format!("parent does not exist: {} ({})", parent.display(), e))?;
            parent_canon.join(
                joined
                    .file_name()
                    .ok_or_else(|| "missing file name".to_string())?,
            )
        }
    };

    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("vault root missing: {} ({})", root.display(), e))?;
    if !canon.starts_with(&root_canon) {
        return Err(format!("path escapes vault: {}", rel));
    }
    Ok(canon)
}

// ---------- flow file commands (existing) ----------

fn flow_path(name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
    {
        return Err(format!("invalid flow name: {}", name));
    }
    let dir = aiia_root()?.join("Flows");
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {}", e))?;
    let filename = if name.ends_with(".flow.json") {
        name.to_string()
    } else {
        format!("{}.flow.json", name)
    };
    Ok(dir.join(filename))
}

#[tauri::command]
fn save_flow(name: String, contents: String) -> Result<String, String> {
    let path = flow_path(&name)?;
    fs::write(&path, contents).map_err(|e| format!("write failed: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_flow(name: String) -> Result<String, String> {
    let path = flow_path(&name)?;
    if !path.exists() {
        return Err(format!("flow not found: {}", path.to_string_lossy()));
    }
    fs::read_to_string(&path).map_err(|e| format!("read failed: {}", e))
}

#[tauri::command]
fn list_flows() -> Result<Vec<String>, String> {
    let dir = aiia_root()?.join("Flows");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read_dir failed: {}", e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".flow.json") {
            out.push(name);
        }
    }
    out.sort();
    Ok(out)
}

// ---------- vault read/write ----------

#[tauri::command]
fn vault_read(path: String) -> Result<String, String> {
    let p = vault_path(&path)?;
    if !p.exists() {
        return Err(format!("not found: {}", p.display()));
    }
    if p.is_file() {
        return fs::read_to_string(&p).map_err(|e| format!("read failed: {}", e));
    }
    if p.is_dir() {
        // Return a directory listing as a markdown-ish block.
        let mut out = String::new();
        out.push_str(&format!("# Directory: {}\n\n", p.display()));
        let mut entries: Vec<_> = fs::read_dir(&p)
            .map_err(|e| format!("read_dir failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let kind = if entry.path().is_dir() { "dir" } else { "file" };
            out.push_str(&format!("- [{}] {}\n", kind, name));
        }
        return Ok(out);
    }
    Err(format!("unsupported path type: {}", p.display()))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum WriteMode {
    Overwrite,
    Append,
    Section,
}

#[tauri::command]
fn vault_write(
    path: String,
    content: String,
    mode: Option<String>,
    section: Option<String>,
) -> Result<String, String> {
    let p = vault_path(&path)?;
    let mode = match mode.as_deref().unwrap_or("overwrite") {
        "overwrite" => WriteMode::Overwrite,
        "append" => WriteMode::Append,
        "section" => WriteMode::Section,
        other => return Err(format!("unknown write mode: {}", other)),
    };

    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {}", e))?;
    }

    match mode {
        WriteMode::Overwrite => {
            fs::write(&p, content).map_err(|e| format!("write failed: {}", e))?;
        }
        WriteMode::Append => {
            use std::io::Write;
            let mut f = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&p)
                .map_err(|e| format!("open failed: {}", e))?;
            f.write_all(content.as_bytes())
                .map_err(|e| format!("append failed: {}", e))?;
        }
        WriteMode::Section => {
            let header = section.ok_or_else(|| "section mode requires 'section'".to_string())?;
            let existing = if p.exists() {
                fs::read_to_string(&p).unwrap_or_default()
            } else {
                String::new()
            };
            let new_block = format!("## {}\n\n{}\n", header, content.trim_end());
            let updated = replace_or_append_section(&existing, &header, &new_block);
            fs::write(&p, updated).map_err(|e| format!("write failed: {}", e))?;
        }
    }
    Ok(p.to_string_lossy().to_string())
}

fn replace_or_append_section(existing: &str, section: &str, new_block: &str) -> String {
    // Find "## <section>" line and replace until next "## " or EOF.
    let needle = format!("## {}", section);
    let mut lines: Vec<&str> = existing.lines().collect();
    let start = lines.iter().position(|l| l.trim() == needle.trim());
    if let Some(s) = start {
        let mut e = lines.len();
        for (i, line) in lines.iter().enumerate().skip(s + 1) {
            if line.starts_with("## ") {
                e = i;
                break;
            }
        }
        let mut out = String::new();
        for (i, line) in lines.iter().enumerate() {
            if i == s {
                out.push_str(new_block);
                if !new_block.ends_with('\n') {
                    out.push('\n');
                }
            }
            if i < s || i >= e {
                out.push_str(line);
                out.push('\n');
            }
        }
        out
    } else {
        // Append, ensuring blank line separation.
        let mut out = String::from(existing);
        if !out.ends_with("\n\n") {
            if out.ends_with('\n') {
                out.push('\n');
            } else {
                out.push_str("\n\n");
            }
        }
        out.push_str(new_block);
        let _ = &mut lines;
        out
    }
}

// ---------- chat sessions ----------
//
// Each session is stored as a single JSON file at
// ~/AIIA/Chats/<uuid>.json. IDs are validated to be nanoid/uuid-shaped (only
// URL-safe alphanumerics, dashes, and underscores; max 64 chars) — never a
// raw caller-supplied path. Deletes are soft: the file is moved to
// ~/.Trash/aiia-console-deleted-chats/.

#[derive(serde::Serialize, serde::Deserialize)]
struct StoredChatMessage {
    role: String,
    content: String,
    timestamp: String,
    #[serde(rename = "providerModelId", skip_serializing_if = "Option::is_none")]
    provider_model_id: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ChatSession {
    id: String,
    title: String,
    created: String,
    updated: String,
    messages: Vec<StoredChatMessage>,
}

#[derive(serde::Serialize)]
struct ChatSessionMeta {
    id: String,
    title: String,
    created: String,
    updated: String,
}

fn validate_session_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 {
        return Err("invalid session id length".into());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid characters in session id".into());
    }
    Ok(())
}

fn chats_dir() -> Result<PathBuf, String> {
    let dir = aiia_root()?.join("Chats");
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {}", e))?;
    Ok(dir)
}

fn chat_file(id: &str) -> Result<PathBuf, String> {
    validate_session_id(id)?;
    Ok(chats_dir()?.join(format!("{}.json", id)))
}

#[tauri::command]
fn chat_list_sessions() -> Result<Vec<ChatSessionMeta>, String> {
    let dir = chats_dir()?;
    let mut out: Vec<ChatSessionMeta> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read_dir failed: {}", e))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".json") {
            continue;
        }
        let path = entry.path();
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        // Parse minimally — only the metadata fields.
        let parsed: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let id = parsed.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if validate_session_id(id).is_err() {
            continue;
        }
        let title = parsed
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled")
            .to_string();
        let created = parsed
            .get("created")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let updated = parsed
            .get("updated")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        out.push(ChatSessionMeta {
            id: id.to_string(),
            title,
            created,
            updated,
        });
    }
    out.sort_by(|a, b| b.updated.cmp(&a.updated));
    Ok(out)
}

#[tauri::command]
fn chat_load_session(id: String) -> Result<ChatSession, String> {
    let path = chat_file(&id)?;
    if !path.exists() {
        return Err(format!("chat not found: {}", id));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read failed: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse failed: {}", e))
}

#[tauri::command]
fn chat_save_session(session: ChatSession) -> Result<String, String> {
    validate_session_id(&session.id)?;
    let path = chat_file(&session.id)?;
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("serialize failed: {}", e))?;
    fs::write(&tmp, body).map_err(|e| format!("tmp write failed: {}", e))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename failed: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn chat_delete_session(id: String) -> Result<String, String> {
    let path = chat_file(&id)?;
    if !path.exists() {
        return Err(format!("chat not found: {}", id));
    }
    let trash = home()?
        .join(".Trash")
        .join("aiia-console-deleted-chats");
    fs::create_dir_all(&trash).map_err(|e| format!("mkdir trash failed: {}", e))?;
    // Use a timestamped filename in the trash so deleting/re-creating the
    // same id doesn't collide.
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = trash.join(format!("{}-{}.json", stamp, id));
    fs::rename(&path, &dest).map_err(|e| format!("trash rename failed: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

// ---------- gateway config (read-only) ----------

#[derive(Serialize)]
struct GatewayInfo {
    base_url: String,
    auth_mode: String,
    token: Option<String>,
    model_default: Option<String>,
}

#[tauri::command]
fn gateway_config() -> Result<GatewayInfo, String> {
    let cfg_path = home()?.join(".openclaw").join("openclaw.json");
    let raw = fs::read_to_string(&cfg_path)
        .map_err(|e| format!("read openclaw.json failed: {}", e))?;
    let cfg: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("parse openclaw.json failed: {}", e))?;

    // Default OpenClaw gateway port.
    let port = cfg
        .pointer("/gateway/port")
        .and_then(|v| v.as_u64())
        .unwrap_or(18789);
    let base_url = format!("http://127.0.0.1:{}", port);

    let auth_mode = cfg
        .pointer("/gateway/auth/mode")
        .and_then(|v| v.as_str())
        .unwrap_or("none")
        .to_string();
    let token = cfg
        .pointer("/gateway/auth/token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let model_default = cfg
        .pointer("/agents/defaults/model/primary")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(GatewayInfo {
        base_url,
        auth_mode,
        token,
        model_default,
    })
}

// ---------- model list (via Ollama HTTP) ----------

#[tauri::command]
async fn ollama_models() -> Result<Vec<String>, String> {
    // Quick passthrough so the UI can show locally-installed models.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("http client init failed: {}", e))?;
    let resp = client
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .await
        .map_err(|e| format!("ollama unreachable: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("ollama returned {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("ollama json parse failed: {}", e))?;
    let models = body
        .get("models")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Ok(models)
}

// ---------- entry ----------

// Handle to the bundled Brain sidecar process (when this app spawned it), so
// we can terminate it cleanly on app exit instead of orphaning it.
struct BrainSidecar(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

// Handle to the bundled Ollama runtime (the model engine), spawned directly
// from the app's resources so local chat works offline on first open.
struct OllamaSidecar(std::sync::Mutex<Option<std::process::Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(InflightCancel::new())
        .manage(BrainSidecar(std::sync::Mutex::new(None)))
        .manage(OllamaSidecar(std::sync::Mutex::new(None)))
        .setup(|app| {
            // On mobile there is no ~/.aiia; resolve a sandbox-writable base
            // dir for config + secrets. Desktop keeps using ~/.aiia.
            #[cfg(mobile)]
            {
                use tauri::Manager;
                if let Ok(dir) = app.path().app_data_dir() {
                    set_aiia_config_dir(dir.join("aiia"));
                }
            }

            // Desktop: spawn the bundled Brain sidecar so memory works with
            // zero config. Probe first — if a Brain is already serving on
            // :8100 (a dev/launchd Brain, or one the user runs), use it and
            // don't spawn a second one fighting for the port.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                use tauri_plugin_shell::ShellExt;

                let port_open = |addr: &str| {
                    addr.parse::<std::net::SocketAddr>()
                        .ok()
                        .and_then(|a| {
                            std::net::TcpStream::connect_timeout(
                                &a,
                                std::time::Duration::from_millis(400),
                            )
                            .ok()
                        })
                        .is_some()
                };

                // Start the bundled Ollama runtime (model engine) unless one is
                // already serving :11434. Bundled as resources (runtime dir +
                // read-only model dir) and spawned directly, so local chat works
                // fully offline on first open. In dev the resources are absent,
                // so this no-ops and the existing Ollama is used.
                if port_open("127.0.0.1:11434") {
                    eprintln!("[aiia] Ollama already on :11434 — using it");
                } else if let Ok(res) = app.path().resource_dir() {
                    let bin = res.join("ollama-runtime/ollama");
                    if bin.exists() {
                        match std::process::Command::new(&bin)
                            .arg("serve")
                            .current_dir(res.join("ollama-runtime"))
                            .env("OLLAMA_HOST", "127.0.0.1:11434")
                            .env("OLLAMA_MODELS", res.join("ollama-models"))
                            .spawn()
                        {
                            Ok(child) => {
                                eprintln!("[aiia] spawned bundled Ollama");
                                app.state::<OllamaSidecar>().0.lock().unwrap().replace(child);
                            }
                            Err(e) => eprintln!("[aiia] could not start bundled Ollama: {e}"),
                        }
                    }
                }

                let brain_up = port_open("127.0.0.1:8100");

                if brain_up {
                    eprintln!("[aiia] Brain already on :8100 — using it; not spawning sidecar");
                } else {
                    // Point the Brain at the baked-in model so its LLM tasks
                    // (journal distill, memory extraction) use what's bundled.
                    let cmd = app.shell().sidecar("aiia-brain").map(|c| {
                        c.env("LOCAL_ROUTING_MODEL", "gemma3:1b")
                            .env("LOCAL_TASK_MODEL", "gemma3:1b")
                            .env("LOCAL_DEEP_MODEL", "gemma3:1b")
                    });
                    match cmd.and_then(|c| c.spawn()) {
                        Ok((_rx, child)) => {
                            eprintln!("[aiia] spawned bundled Brain sidecar");
                            app.state::<BrainSidecar>().0.lock().unwrap().replace(child);
                        }
                        Err(e) => eprintln!("[aiia] could not start bundled Brain: {e}"),
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_flow,
            load_flow,
            list_flows,
            vault_read,
            vault_write,
            gateway_config,
            ollama_models,
            chat_list_sessions,
            chat_load_session,
            chat_save_session,
            chat_delete_session,
            keystore_get_keys,
            keystore_set_key,
            keystore_delete_key,
            keystore_call,
            keystore_call_cancel,
            keystore_transcribe,
            brain_status,
            brain_list_memories,
            brain_get_memory,
            brain_remember,
            brain_forget,
            brain_search,
            brain_get_url,
            brain_set_url,
            loop_list_instances,
            loop_status,
            loop_belief,
            loop_escalations,
            loop_launch,
            loop_is_running,
            loop_stop,
            loop_create,
            loop_generate_cases,
            loop_adapters_available,
            loop_tail_log,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Terminate the bundled Brain sidecar on exit so it doesn't orphan.
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { .. } = event {
                use tauri::Manager;
                if let Some(child) =
                    app_handle.state::<BrainSidecar>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                }
                if let Some(mut child) =
                    app_handle.state::<OllamaSidecar>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn section_replace_basic() {
        let existing = "# Note\n\n## Old\n\nold body\n\n## Keep\n\nkeep me\n";
        let new_block = "## Old\n\nnew body\n";
        let out = replace_or_append_section(existing, "Old", new_block);
        assert!(out.contains("new body"));
        assert!(!out.contains("old body"));
        assert!(out.contains("keep me"));
    }

    #[test]
    fn section_append_when_missing() {
        let existing = "# Note\n\nbody\n";
        let new_block = "## Added\n\nnew\n";
        let out = replace_or_append_section(existing, "Added", new_block);
        assert!(out.contains("body"));
        assert!(out.contains("## Added"));
    }

    #[test]
    fn rejects_traversal() {
        assert!(vault_path("../etc/passwd").is_err());
        assert!(vault_path("/etc/passwd").is_err());
        assert!(vault_path("").is_err());
    }

    #[test]
    fn session_id_validation() {
        assert!(validate_session_id("abc123_-XYZ").is_ok());
        assert!(validate_session_id("").is_err());
        assert!(validate_session_id("../etc/passwd").is_err());
        assert!(validate_session_id("contains/slash").is_err());
        assert!(validate_session_id("has space").is_err());
        assert!(validate_session_id(&"a".repeat(65)).is_err());
    }
}
