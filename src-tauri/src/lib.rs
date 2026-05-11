// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::PathBuf;

/// Resolve `~/AIIA/Flows/<name>.flow.json`, ensuring the parent dir exists.
fn flow_path(name: &str) -> Result<PathBuf, String> {
    // Reject any path separators or traversal — we only allow a flat filename.
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
    {
        return Err(format!("invalid flow name: {}", name));
    }

    let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
    let dir = home.join("AIIA").join("Flows");
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
    let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
    let dir = home.join("AIIA").join("Flows");
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_flow, load_flow, list_flows])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
