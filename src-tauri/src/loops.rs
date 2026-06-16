// Tauri commands for the research-execution loop runner.
//
// Mirrors the convention used by `brain.rs` and `keystore.rs`: each command
// is a `#[tauri::command]` async fn, returns `Result<T, String>`, and validates
// caller-supplied identifiers before touching the filesystem.
//
// State layout (matches the Python `loops/` package on disk):
//
//   ~/.aiia/loops/<name>/state.json   loop state written by Python runner
//   ~/.aiia/loops/<name>/config.json  spawn config (project_root, python_exec)
//   ~/.aiia/loops/<name>/.pid         PID of running subprocess, if any
//   ~/.aiia/loops/<name>/console.log  stdout+stderr tail target for the runner
//   ~/.aiia/loops/<name>/runs/...     per-iteration JSONL/meta outputs
//
//   <vault_root>/20-Workstreams/<name>-belief.md       belief file
//   <vault_root>/_inbox/escalations/<name>/*.md        escalation notes
//
// The Python `cli init` command must write `config.json` into the state dir
// when initialising a loop. That file tells the Rust side which Python to
// invoke and what working directory to run it from.

use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{aiia_root, home};

// ---------- name validation ----------

fn validate_loop_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err("invalid loop name length".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid characters in loop name (use alphanumeric, '-', '_')".into());
    }
    Ok(())
}

// ---------- path helpers ----------

fn loops_root() -> Result<PathBuf, String> {
    Ok(home()?.join(".aiia").join("loops"))
}

fn state_dir(name: &str) -> Result<PathBuf, String> {
    validate_loop_name(name)?;
    Ok(loops_root()?.join(name))
}

fn state_file(name: &str) -> Result<PathBuf, String> {
    Ok(state_dir(name)?.join("state.json"))
}

fn config_file(name: &str) -> Result<PathBuf, String> {
    Ok(state_dir(name)?.join("config.json"))
}

fn pid_file(name: &str) -> Result<PathBuf, String> {
    Ok(state_dir(name)?.join(".pid"))
}

fn log_file(name: &str) -> Result<PathBuf, String> {
    Ok(state_dir(name)?.join("console.log"))
}

fn belief_file(name: &str) -> Result<PathBuf, String> {
    validate_loop_name(name)?;
    Ok(aiia_root()?
        .join("20-Workstreams")
        .join(format!("{}-belief.md", name)))
}

fn escalations_dir(name: &str) -> Result<PathBuf, String> {
    validate_loop_name(name)?;
    Ok(aiia_root()?.join("_inbox").join("escalations").join(name))
}

// ---------- shared types ----------

#[derive(Serialize)]
pub struct LoopInstance {
    name: String,
    status: String, // "idle" | "running" | "terminated"
    last_iter_ts: Option<String>,
    iter_count: u64,
    queue_count: usize,
}

#[derive(Serialize)]
pub struct LoopStatus {
    name: String,
    adapter: String,
    iter_count: u64,
    queue_count: usize,
    completed_count: usize,
    last_iter_ts: Option<String>,
    termination_reason: Option<String>,
    budget: Value, // pass-through; React renders what it knows about
    escalations_count: usize,
    state_dir: String,
    belief_path: String,
}

#[derive(Serialize)]
pub struct BeliefView {
    frontmatter: Value,
    body: String,
    path: String,
    exists: bool,
}

#[derive(Serialize)]
pub struct EscalationView {
    file: String,           // basename
    emitted_at: String,     // parsed from filename prefix
    type_: String,          // parsed from filename suffix
    severity: String,       // best-effort from file content
    body_preview: String,   // first ~400 chars
}

#[derive(Serialize)]
pub struct LaunchInfo {
    pid: u32,
    log_path: String,
    started_at: String,
}

#[derive(Serialize)]
pub struct RunningInfo {
    running: bool,
    pid: Option<u32>,
    started_at: Option<String>,
}

// ---------- helpers ----------

#[derive(Deserialize)]
struct LoopConfig {
    project_root: String,
    python_exec: String,
    #[serde(default = "default_cli_module")]
    cli_module: String,
}

fn default_cli_module() -> String {
    "loops.cli".to_string()
}

fn read_state_json(name: &str) -> Result<Value, String> {
    let p = state_file(name)?;
    let raw = fs::read_to_string(&p).map_err(|e| format!("read state.json failed: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse state.json failed: {}", e))
}

fn read_config_json(name: &str) -> Result<LoopConfig, String> {
    let p = config_file(name)?;
    let raw = fs::read_to_string(&p)
        .map_err(|e| format!("read config.json failed (was the loop initialised via `loop init`?): {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse config.json failed: {}", e))
}

fn pid_alive(pid: u32) -> bool {
    // POSIX `kill(pid, 0)` returns 0 if process exists, regardless of permissions.
    // On macOS std::process doesn't expose this; shell out to `kill -0`.
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn read_pid(name: &str) -> Result<Option<u32>, String> {
    let p = pid_file(name)?;
    if !p.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read .pid failed: {}", e))?;
    let trimmed = raw.trim();
    let parts: Vec<&str> = trimmed.splitn(2, '|').collect();
    let pid_str = parts.first().copied().unwrap_or("").trim();
    if pid_str.is_empty() {
        return Ok(None);
    }
    pid_str
        .parse::<u32>()
        .map(Some)
        .map_err(|e| format!("malformed .pid file: {}", e))
}

fn read_pid_started_at(name: &str) -> Result<Option<String>, String> {
    let p = pid_file(name)?;
    if !p.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read .pid failed: {}", e))?;
    let trimmed = raw.trim();
    let parts: Vec<&str> = trimmed.splitn(2, '|').collect();
    Ok(parts.get(1).map(|s| s.trim().to_string()))
}

fn write_pid(name: &str, pid: u32, started_at: &str) -> Result<(), String> {
    let p = pid_file(name)?;
    fs::write(&p, format!("{}|{}\n", pid, started_at)).map_err(|e| format!("write .pid failed: {}", e))
}

fn clear_pid(name: &str) -> Result<(), String> {
    let p = pid_file(name)?;
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("remove .pid failed: {}", e))?;
    }
    Ok(())
}

fn iso_now() -> String {
    // Lightweight UTC timestamp without pulling chrono in.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 1970-01-01T00:00:00Z + now seconds, computed by hand.
    let (year, month, day, hour, min, sec) = unix_to_ymdhms(now);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, min, sec
    )
}

fn unix_to_ymdhms(t: u64) -> (i32, u32, u32, u32, u32, u32) {
    // Algorithm from Howard Hinnant's date library, simplified for positive UTC.
    let secs_per_day = 86_400u64;
    let days = (t / secs_per_day) as i64;
    let secs_of_day = (t % secs_per_day) as u32;
    let hour = secs_of_day / 3600;
    let min = (secs_of_day % 3600) / 60;
    let sec = secs_of_day % 60;
    // Days since 1970-01-01 to civil date.
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year as i32, m as u32, d as u32, hour, min, sec)
}

// ---------- LLM-driven case generation ----------
//
// `loop_generate_cases` asks a model to propose research cases that match the
// adapter's schema, given a source text. v0 routes only to local Ollama
// (localhost:11434) because that's what's running on the mini today; cloud
// providers come next once the local path is proven.

#[derive(Deserialize)]
pub struct GenerateArgs {
    /// Adapter id (e.g. "loops.adapters.erdos_es7"). Used to look up the schema.
    pub adapter_id: String,
    /// Free-form source text — pasted prompt, problem statement, URL contents, etc.
    pub source_text: String,
    /// Number of cases to ask the model for. The Rust side does no enforcement
    /// beyond a hard cap of 20; the model may return fewer.
    pub n: u32,
    /// Model id understood by Ollama (e.g. "gemma3:4b", "llama3.1:8b").
    pub model: String,
    /// Optional system prompt override. The default emphasises strict JSON.
    #[serde(default)]
    pub system_prompt: Option<String>,
    /// Optional Ollama base URL. Defaults to http://127.0.0.1:11434.
    #[serde(default)]
    pub ollama_url: Option<String>,
}

#[derive(Serialize)]
pub struct GenerateResult {
    /// Cases proposed by the model, in the same shape as `CreateCase`.
    cases: Vec<Value>,
    /// Raw response text — surfaced to the UI so you can see what the model
    /// actually said when parsing fails or returns fewer cases than asked.
    raw_response: String,
    model: String,
    elapsed_s: f64,
}

/// Read AIIA's self-knowledge prompt from the vault if present.
/// Returns empty string if the file doesn't exist — the prompt remains valid,
/// just without the AIIA context preamble.
fn load_aiia_context() -> String {
    let root = match aiia_root() {
        Ok(r) => r,
        Err(_) => return String::new(),
    };
    let p = root.join("70-Areas").join("aiia-self").join("_AIIA-CONTEXT.md");
    fs::read_to_string(&p).unwrap_or_default()
}

fn build_generator_prompt(adapter: &AdapterInfo, source: &str, n: u32) -> String {
    // Render the schema as compact pseudo-JSON the model can follow without
    // needing a tool-use roundtrip. Each param's type, range, and help text
    // are surfaced so the model knows the constraints.
    let params_block = adapter
        .case_params
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let key = p.get("key")?.as_str()?;
                    let ty = p.get("type")?.as_str()?;
                    let default = p.get("default").map(|v| v.to_string()).unwrap_or_default();
                    let min = p.get("min").map(|v| v.to_string()).unwrap_or_default();
                    let max = p.get("max").map(|v| v.to_string()).unwrap_or_default();
                    let help = p.get("help").and_then(|v| v.as_str()).unwrap_or("");
                    let mut line = format!("  - {} ({})", key, ty);
                    if !default.is_empty() {
                        line.push_str(&format!(" default={}", default));
                    }
                    if !min.is_empty() || !max.is_empty() {
                        line.push_str(&format!(" range=[{}, {}]", min, max));
                    }
                    if !help.is_empty() {
                        line.push_str(&format!(" — {}", help));
                    }
                    Some(line)
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    format!(
        "You are proposing research-case specifications for a closed-loop experiment harness.\n\
\n\
Adapter: {} ({})\n\
Description: {}\n\
\n\
Each case takes these parameters:\n\
{}\n\
\n\
Source text:\n\
---\n\
{}\n\
---\n\
\n\
Propose exactly {} diverse case specifications grounded in the source. \
Vary the parameter values to explore different regions of the space. \
Avoid duplicates. Prefer cases that test a hypothesis the source raises.\n\
\n\
Return ONLY a JSON object of the shape:\n\
{{\"cases\": [\n  {{\"case_id\": \"snake_case_id\", \"params\": {{...}}, \"note\": \"one-line summary\", \"rationale\": \"why this is worth running\"}}\n]}}\n\
\n\
No prose. No markdown fences. case_id MUST be unique across the array.",
        adapter.label, adapter.id, adapter.description, params_block, source, n.min(20)
    )
}

#[tauri::command]
pub async fn loop_generate_cases(args: GenerateArgs) -> Result<GenerateResult, String> {
    // Look up the adapter so the prompt knows what to ask for.
    let adapters = loop_adapters_available().await?;
    let adapter = adapters
        .iter()
        .find(|a| a.id == args.adapter_id)
        .ok_or_else(|| format!("unknown adapter: {}", args.adapter_id))?;

    let prompt = build_generator_prompt(adapter, &args.source_text, args.n);

    // Prepend AIIA self-knowledge so the model knows what AIIA is before
    // proposing cases. Without this, generic models (Gemma 4, etc.) fall back
    // to their training-data priors and ask "what does AIIA stand for?" —
    // which is the failure mode that motivated this file.
    let aiia_context = load_aiia_context();
    let system_default = if aiia_context.is_empty() {
        "You return strict JSON. No prose, no markdown fences, no commentary.".to_string()
    } else {
        format!(
            "{}\n\n---\n\nYou return strict JSON. No prose, no markdown fences, no commentary.",
            aiia_context
        )
    };
    let system = args.system_prompt.unwrap_or(system_default);

    let base_url = args
        .ollama_url
        .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
    let endpoint = format!("{}/api/chat", base_url.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": args.model,
        "stream": false,
        "format": "json",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("http client init failed: {}", e))?;

    let t0 = std::time::Instant::now();
    let resp = client
        .post(&endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ollama unreachable at {}: {}", endpoint, e))?;
    if !resp.status().is_success() {
        return Err(format!("ollama returned status {}", resp.status()));
    }
    let raw: Value = resp
        .json()
        .await
        .map_err(|e| format!("ollama response parse failed: {}", e))?;
    let elapsed_s = t0.elapsed().as_secs_f64();

    let content = raw
        .pointer("/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Parse the model's JSON. Ollama's `format: "json"` guarantees this is
    // syntactically valid JSON; structure validation happens client-side.
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|e| format!("generator returned invalid JSON: {} — raw: {}", e, content))?;

    let cases = parsed
        .get("cases")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(GenerateResult {
        cases,
        raw_response: content,
        model: args.model,
        elapsed_s,
    })
}

// ---------- adapter discovery + loop creation ----------

#[derive(Serialize)]
pub struct AdapterInfo {
    id: String,
    label: String,
    description: String,
    /// Raw JSON of the case_params array. React parses the shape; Rust stays generic.
    case_params: Value,
}

/// Default project root used by `loop_adapters_available` and `loop_create`
/// when no override is configured. Mirrors where the Erdős project actually lives
/// on this machine; surface as an env var so it can be overridden without a rebuild.
fn default_project_root() -> PathBuf {
    if let Ok(p) = std::env::var("AIIA_LOOPS_PROJECT_ROOT") {
        return PathBuf::from(p);
    }
    if let Ok(h) = home() {
        // Canonical Mac-mini iCloud path. If this doesn't exist on a given
        // machine, the env var override is the escape hatch.
        let candidate = h
            .join("Documents")
            .join("Documents - Eric’s Mac mini")
            .join("Claude")
            .join("Projects")
            .join("Erdos Numbers");
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from(".")
}

fn default_python_exec() -> String {
    std::env::var("AIIA_LOOPS_PYTHON").unwrap_or_else(|_| "python3".to_string())
}

/// Read each known adapter's schema JSON from `<project_root>/loops/adapters/<id>.schema.json`.
/// For now we hard-code the adapter id list; later we'll glob the adapters directory.
#[tauri::command]
pub async fn loop_adapters_available() -> Result<Vec<AdapterInfo>, String> {
    let root = default_project_root();
    let known = ["erdos_es7"]; // extend as new adapters land
    let mut out = Vec::new();
    for short_id in known {
        let schema_path = root
            .join("loops")
            .join("adapters")
            .join(format!("{}.schema.json", short_id));
        if !schema_path.exists() {
            continue;
        }
        let raw = fs::read_to_string(&schema_path)
            .map_err(|e| format!("read {} failed: {}", schema_path.display(), e))?;
        let parsed: Value = serde_json::from_str(&raw)
            .map_err(|e| format!("parse {} failed: {}", schema_path.display(), e))?;
        let id = parsed
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or(short_id)
            .to_string();
        let label = parsed
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or(short_id)
            .to_string();
        let description = parsed
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let case_params = parsed.get("case_params").cloned().unwrap_or(Value::Array(vec![]));
        out.push(AdapterInfo {
            id,
            label,
            description,
            case_params,
        });
    }
    Ok(out)
}

#[derive(Deserialize)]
pub struct CreateCase {
    case_id: String,
    params: Value,
    #[serde(default)]
    note: String,
    #[serde(default)]
    rationale: String,
}

#[derive(Deserialize)]
pub struct CreateBudget {
    #[serde(default)]
    compute_seconds: Option<f64>,
    #[serde(default)]
    wallclock_seconds: Option<f64>,
    #[serde(default)]
    dollars: Option<f64>,
}

#[derive(Serialize)]
pub struct CreateResult {
    name: String,
    state_dir: String,
    belief_path: String,
    cases_added: usize,
}

/// Initialize a new loop from inside the Console. Writes a temp queue file
/// containing the CaseSpecs, then shells out to `python3 -m loops.cli init`.
/// The Python CLI writes config.json on success, which subsequent `loop_launch`
/// calls read.
#[tauri::command]
pub async fn loop_create(
    name: String,
    adapter: String,
    cases: Vec<CreateCase>,
    budget: Option<CreateBudget>,
) -> Result<CreateResult, String> {
    validate_loop_name(&name)?;
    if adapter.is_empty() {
        return Err("adapter is required".into());
    }
    if cases.is_empty() {
        return Err("at least one case is required".into());
    }

    let project_root = default_project_root();
    if !project_root.exists() {
        return Err(format!(
            "project_root does not exist: {} (set AIIA_LOOPS_PROJECT_ROOT)",
            project_root.display()
        ));
    }
    let python_exec = default_python_exec();

    // Materialise the cases as JSON for `cli init --queue-from <file>`.
    let queue_json: Vec<Value> = cases
        .into_iter()
        .map(|c| {
            serde_json::json!({
                "case_id": c.case_id,
                "params": c.params,
                "note": c.note,
                "rationale": c.rationale,
                "source": "console",
            })
        })
        .collect();
    let cases_added = queue_json.len();

    let tmp_dir = std::env::temp_dir().join(format!("aiia-loop-create-{}", name));
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir tmp failed: {}", e))?;
    let queue_path = tmp_dir.join("queue.json");
    fs::write(&queue_path, serde_json::to_string_pretty(&queue_json).map_err(|e| e.to_string())?)
        .map_err(|e| format!("write tmp queue failed: {}", e))?;

    // Build the CLI invocation.
    let mut cmd = Command::new(&python_exec);
    cmd.current_dir(&project_root)
        .arg("-m")
        .arg("loops.cli")
        .arg("init")
        .arg(&name)
        .arg("--adapter")
        .arg(&adapter)
        .arg("--queue-from")
        .arg(queue_path.to_string_lossy().to_string());
    if let Some(b) = budget {
        if let Some(v) = b.compute_seconds {
            cmd.arg("--budget-compute").arg(v.to_string());
        }
        if let Some(v) = b.wallclock_seconds {
            cmd.arg("--budget-wallclock").arg(v.to_string());
        }
        if let Some(v) = b.dollars {
            cmd.arg("--budget-dollars").arg(v.to_string());
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("spawn python failed: {}", e))?;

    // Don't leave the temp queue lying around.
    let _ = fs::remove_dir_all(&tmp_dir);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "cli init failed (status {:?}). stderr:\n{}\nstdout:\n{}",
            output.status.code(),
            stderr,
            stdout
        ));
    }

    let sd = state_dir(&name)?;
    let bp = belief_file(&name)?;
    Ok(CreateResult {
        name,
        state_dir: sd.to_string_lossy().to_string(),
        belief_path: bp.to_string_lossy().to_string(),
        cases_added,
    })
}

// ---------- commands ----------

/// List every loop instance directory under ~/.aiia/loops/. For each, infer
/// status from PID file + state.json.
#[tauri::command]
pub async fn loop_list_instances() -> Result<Vec<LoopInstance>, String> {
    let root = loops_root()?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut out: Vec<LoopInstance> = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| format!("read_dir failed: {}", e))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if validate_loop_name(&name).is_err() {
            continue;
        }

        let state = read_state_json(&name).unwrap_or(Value::Null);
        let iter_count = state
            .get("iter_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let queue_count = state
            .get("todo_queue")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        let last_iter_ts = state
            .get("last_iter_ts")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let termination_reason = state
            .get("termination_reason")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let pid = read_pid(&name).unwrap_or(None);
        let status = match (pid, termination_reason.as_deref()) {
            (Some(p), _) if pid_alive(p) => "running",
            (_, Some(_)) => "terminated",
            _ => "idle",
        }
        .to_string();

        out.push(LoopInstance {
            name,
            status,
            last_iter_ts,
            iter_count,
            queue_count,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Full status for one loop instance.
#[tauri::command]
pub async fn loop_status(name: String) -> Result<LoopStatus, String> {
    validate_loop_name(&name)?;
    let state = read_state_json(&name)?;

    let adapter = state
        .get("adapter")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let iter_count = state.get("iter_count").and_then(|v| v.as_u64()).unwrap_or(0);
    let queue_count = state
        .get("todo_queue")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let completed_count = state
        .get("completed_cases")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let last_iter_ts = state
        .get("last_iter_ts")
        .and_then(|v| v.as_str())
        .map(String::from);
    let termination_reason = state
        .get("termination_reason")
        .and_then(|v| v.as_str())
        .map(String::from);
    let budget = state.get("budget").cloned().unwrap_or(Value::Null);
    let escalations_count = state
        .get("escalations")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    Ok(LoopStatus {
        name: name.clone(),
        adapter,
        iter_count,
        queue_count,
        completed_count,
        last_iter_ts,
        termination_reason,
        budget,
        escalations_count,
        state_dir: state_dir(&name)?.to_string_lossy().to_string(),
        belief_path: belief_file(&name)?.to_string_lossy().to_string(),
    })
}

/// Read the belief file (Markdown + YAML frontmatter). Splits on the `---`
/// fence and parses the YAML via serde_yaml. Frontmatter is returned as a
/// generic Value so the React side can render whatever shape the adapter chose.
#[tauri::command]
pub async fn loop_belief(name: String) -> Result<BeliefView, String> {
    let path = belief_file(&name)?;
    if !path.exists() {
        return Ok(BeliefView {
            frontmatter: Value::Null,
            body: String::new(),
            path: path.to_string_lossy().to_string(),
            exists: false,
        });
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read belief failed: {}", e))?;

    // Parse "---\n<yaml>\n---\n<body>" manually — no chrono/serde_yaml dependency.
    let (front, body) = match split_frontmatter(&text) {
        Some(pair) => pair,
        None => (String::new(), text.clone()),
    };

    let frontmatter = if front.is_empty() {
        Value::Null
    } else {
        // Convert a *very small* subset of YAML to JSON via a sidecar shell to PyYAML
        // would be cleaner, but for now we just hand back the raw text so React can
        // render it as a code block until the proper parse is wired through PyYAML
        // on the Python side. The body is what users mainly read.
        //
        // Practical fix: pretty-print the YAML as a string under a synthetic key,
        // so the React side renders it without needing a Rust YAML parser today.
        let mut obj = serde_json::Map::new();
        obj.insert("yaml_text".to_string(), Value::String(front));
        Value::Object(obj)
    };

    Ok(BeliefView {
        frontmatter,
        body,
        path: path.to_string_lossy().to_string(),
        exists: true,
    })
}

fn split_frontmatter(text: &str) -> Option<(String, String)> {
    let trimmed = text.trim_start_matches('\u{feff}'); // strip UTF-8 BOM if any
    if !trimmed.starts_with("---") {
        return None;
    }
    let after_first = &trimmed[3..];
    // find the closing `---` line
    let end = after_first.find("\n---")?;
    let front = &after_first[..end];
    let after = &after_first[end + 4..];
    // skip the newline after `---`
    let after = after.trim_start_matches('\n');
    Some((front.trim().to_string(), after.to_string()))
}

/// List escalation notes under the vault inbox for this loop.
/// `since` is optional ISO-8601; only files lexicographically greater than it
/// are returned (filenames are timestamp-prefixed, so this works as a cheap
/// "what's new since I last looked" filter).
#[tauri::command]
pub async fn loop_escalations(
    name: String,
    since: Option<String>,
) -> Result<Vec<EscalationView>, String> {
    let dir = escalations_dir(&name)?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out: Vec<EscalationView> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read_dir failed: {}", e))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let fname = entry.file_name().to_string_lossy().to_string();
        if !fname.ends_with(".md") {
            continue;
        }
        if let Some(ref s) = since {
            if fname.as_str() <= s.as_str() {
                continue;
            }
        }
        // filename shape: "<ts>-<type>.md", with ts like "2026-06-04T22-13-00Z"
        let stem = fname.trim_end_matches(".md");
        let (ts, ty) = split_escalation_name(stem);

        let body = fs::read_to_string(entry.path()).unwrap_or_default();
        let severity = extract_field(&body, "severity").unwrap_or_else(|| "info".to_string());
        let preview: String = body.chars().take(400).collect();

        out.push(EscalationView {
            file: fname,
            emitted_at: ts,
            type_: ty,
            severity,
            body_preview: preview,
        });
    }
    out.sort_by(|a, b| b.emitted_at.cmp(&a.emitted_at));
    Ok(out)
}

fn split_escalation_name(stem: &str) -> (String, String) {
    // The Python runner names files "<ts-with-dashes>-<TYPE>" where ts has 'Z'
    // at the end. Split on the last '-' that comes AFTER the trailing 'Z'.
    if let Some(z_idx) = stem.rfind('Z') {
        let after_z = &stem[z_idx + 1..];
        if let Some(dash_idx) = after_z.find('-') {
            let ts = &stem[..z_idx + 1];
            let ty = &after_z[dash_idx + 1..];
            return (ts.to_string(), ty.to_string());
        }
        // No '-' after Z; whole thing is timestamp, no type
        return (stem.to_string(), String::new());
    }
    (stem.to_string(), String::new())
}

fn extract_field(body: &str, key: &str) -> Option<String> {
    let needle = format!("- {}:", key);
    for line in body.lines() {
        if line.trim_start().starts_with(&needle) {
            let rest = line.split_once(':').map(|(_, v)| v.trim()).unwrap_or("");
            if !rest.is_empty() {
                return Some(rest.to_string());
            }
        }
    }
    None
}

/// Spawn the Python loop runner as a detached background process. The PID is
/// written to ~/.aiia/loops/<name>/.pid alongside the launch timestamp.
///
/// If a previous process is still alive, this returns an error rather than
/// double-spawning. Caller should `loop_stop` first.
#[tauri::command]
pub async fn loop_launch(
    name: String,
    iter_limit: Option<u32>,
) -> Result<LaunchInfo, String> {
    validate_loop_name(&name)?;

    if let Some(prior) = read_pid(&name)? {
        if pid_alive(prior) {
            return Err(format!(
                "loop '{}' already running as pid {}; stop it first",
                name, prior
            ));
        }
        // stale PID file; clean up.
        let _ = clear_pid(&name);
    }

    let cfg = read_config_json(&name)?;
    let log_path = log_file(&name)?;
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir log dir failed: {}", e))?;
    }
    // Open log file in append mode; both stdout and stderr point here.
    let stdout_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("open log file failed: {}", e))?;
    let stderr_file = stdout_file
        .try_clone()
        .map_err(|e| format!("dup log fd failed: {}", e))?;

    let mut cmd = Command::new(&cfg.python_exec);
    cmd.current_dir(&cfg.project_root)
        .arg("-m")
        .arg(&cfg.cli_module)
        .arg("run")
        .arg(&name);
    if let Some(n) = iter_limit {
        cmd.arg("--iter-limit").arg(n.to_string());
    }
    cmd.stdout(Stdio::from(stdout_file)).stderr(Stdio::from(stderr_file));

    // Detach from parent process group so closing the Console doesn't kill the loop.
    #[cfg(unix)]
    unsafe {
        use std::os::unix::process::CommandExt;
        cmd.pre_exec(|| {
            // setsid() — make this process a new session leader, detached.
            if libc::setsid() < 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }

    let child = cmd.spawn().map_err(|e| {
        format!(
            "spawn loop runner failed (python_exec={}, project_root={}): {}",
            cfg.python_exec, cfg.project_root, e
        )
    })?;
    let pid = child.id();
    let started_at = iso_now();
    write_pid(&name, pid, &started_at)?;

    Ok(LaunchInfo {
        pid,
        log_path: log_path.to_string_lossy().to_string(),
        started_at,
    })
}

/// Is the loop currently running? Reads .pid, probes the process. Cleans up
/// stale PID files when it finds them.
#[tauri::command]
pub async fn loop_is_running(name: String) -> Result<RunningInfo, String> {
    validate_loop_name(&name)?;
    let pid = read_pid(&name)?;
    let started_at = read_pid_started_at(&name)?;
    match pid {
        Some(p) if pid_alive(p) => Ok(RunningInfo {
            running: true,
            pid: Some(p),
            started_at,
        }),
        Some(_) => {
            // stale PID file; clean up.
            let _ = clear_pid(&name);
            Ok(RunningInfo {
                running: false,
                pid: None,
                started_at: None,
            })
        }
        None => Ok(RunningInfo {
            running: false,
            pid: None,
            started_at: None,
        }),
    }
}

/// SIGTERM the running loop. Returns immediately. Caller should poll
/// `loop_is_running` to confirm the process exited.
#[tauri::command]
pub async fn loop_stop(name: String) -> Result<(), String> {
    validate_loop_name(&name)?;
    let pid = read_pid(&name)?.ok_or_else(|| "loop is not running".to_string())?;
    if !pid_alive(pid) {
        let _ = clear_pid(&name);
        return Err("loop pid file existed but process is gone".into());
    }
    let status = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("kill failed: {}", e))?;
    if !status.success() {
        return Err(format!("kill returned non-zero status: {:?}", status));
    }
    // Don't clear the PID file here — let `loop_is_running` reap it after the
    // process actually exits. That way the UI can show "stopping..." briefly.
    Ok(())
}

/// Tail the last N lines of the loop's combined stdout/stderr log.
#[tauri::command]
pub async fn loop_tail_log(name: String, lines: usize) -> Result<String, String> {
    validate_loop_name(&name)?;
    let lines = lines.clamp(1, 5000);
    let path = log_file(&name)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read log failed: {}", e))?;
    let collected: Vec<&str> = text.lines().collect();
    let n = collected.len();
    let start = n.saturating_sub(lines);
    Ok(collected[start..].join("\n"))
}

// ---------- tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loop_name_validation() {
        assert!(validate_loop_name("erdos-es7-sweep").is_ok());
        assert!(validate_loop_name("abc_123-XYZ").is_ok());
        assert!(validate_loop_name("").is_err());
        assert!(validate_loop_name("../etc/passwd").is_err());
        assert!(validate_loop_name("has space").is_err());
        assert!(validate_loop_name("contains/slash").is_err());
        assert!(validate_loop_name(&"a".repeat(65)).is_err());
    }

    #[test]
    fn split_frontmatter_basic() {
        let text = "---\nfoo: bar\n---\n\nbody here\n";
        let (front, body) = split_frontmatter(text).unwrap();
        assert_eq!(front, "foo: bar");
        assert_eq!(body.trim(), "body here");
    }

    #[test]
    fn split_frontmatter_no_fence_returns_none() {
        let text = "no frontmatter here\n";
        assert!(split_frontmatter(text).is_none());
    }

    #[test]
    fn escalation_name_split() {
        let (ts, ty) = split_escalation_name("2026-06-04T22-13-00Z-NeedsRefill");
        assert_eq!(ts, "2026-06-04T22-13-00Z");
        assert_eq!(ty, "NeedsRefill");
    }

    #[test]
    fn unix_epoch_origin() {
        let (y, m, d, hh, mm, ss) = unix_to_ymdhms(0);
        assert_eq!((y, m, d, hh, mm, ss), (1970, 1, 1, 0, 0, 0));
    }
}
