use crate::converter::{probe, ConversionJob, ConversionManager, ConversionOptions, ProbeInfo};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

#[tauri::command]
pub async fn add_conversion(
    state: State<'_, ConversionManager>,
    app: AppHandle,
    input_path: String,
    output_path: String,
    options: ConversionOptions,
    auto_start: bool,
) -> Result<String, String> {
    let id = state.add_job(input_path, output_path, options).await?;
    if auto_start {
        spawn_job(state.inner().clone(), id.clone(), app);
    }
    Ok(id)
}

#[tauri::command]
pub async fn start_queued_conversion(
    state: State<'_, ConversionManager>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    spawn_job(state.inner().clone(), id, app);
    Ok(())
}

fn spawn_job(manager: ConversionManager, id: String, app: AppHandle) {
    tokio::spawn(async move {
        let (tx, mut rx) = mpsc::unbounded_channel::<ConversionJob>();
        let app_emit = app.clone();
        let emit_handle = tokio::spawn(async move {
            while let Some(job) = rx.recv().await {
                let _ = app_emit.emit("conversion-progress", job);
            }
        });
        let _ = manager.start_job(id, tx).await;
        let _ = emit_handle.await;
    });
}

#[tauri::command]
pub async fn cancel_conversion(
    state: State<'_, ConversionManager>,
    id: String,
) -> Result<(), String> {
    state.cancel(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn remove_conversion(
    state: State<'_, ConversionManager>,
    id: String,
) -> Result<(), String> {
    state.remove(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn get_conversions(
    state: State<'_, ConversionManager>,
) -> Result<Vec<ConversionJob>, String> {
    Ok(state.get_all().await)
}

#[tauri::command]
pub async fn probe_file(path: String) -> Result<ProbeInfo, String> {
    probe(&path).await
}

#[tauri::command]
pub async fn check_ffmpeg() -> Result<bool, String> {
    Ok(binary_exists("ffmpeg"))
}

#[tauri::command]
pub async fn check_ffprobe() -> Result<bool, String> {
    Ok(binary_exists("ffprobe"))
}

#[tauri::command]
pub async fn check_hwaccel() -> Result<Vec<String>, String> {
    use std::process::Stdio;
    use tokio::process::Command;
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-encoders"]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    let text = String::from_utf8_lossy(&output.stdout);

    let mut found = Vec::new();
    let checks = [
        ("nvenc", "h264_nvenc"),
        ("qsv", "h264_qsv"),
        ("videotoolbox", "h264_videotoolbox"),
        ("vaapi", "h264_vaapi"),
        ("amf", "h264_amf"),
    ];
    for (label, needle) in checks {
        if text.contains(needle) {
            found.push(label.to_string());
        }
    }
    Ok(found)
}

#[tauri::command]
pub async fn get_default_output_dir() -> Result<String, String> {
    dirs_next::video_dir()
        .or_else(dirs_next::document_dir)
        .or_else(dirs_next::home_dir)
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine output directory".to_string())
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    let folder = if path.is_file() {
        path.parent().unwrap_or(&path).to_path_buf()
    } else {
        path
    };
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(folder.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(folder.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(folder.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumbnail {
    pub path: String,
    pub time_seconds: f64,
}

#[tauri::command]
pub async fn extract_thumbnails(
    input_path: String,
    count: u32,
    duration_seconds: f64,
) -> Result<Vec<Thumbnail>, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    if duration_seconds <= 0.0 {
        return Err("Duration is zero, cannot extract thumbnails.".into());
    }
    let count = count.clamp(2, 32);

    let cache_root = dirs_next::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("format-reaper")
        .join("thumbs");
    std::fs::create_dir_all(&cache_root).map_err(|e| e.to_string())?;

    let key = hash_path_key(&input_path);
    let dir = cache_root.join(&key);
    let _ = std::fs::create_dir_all(&dir);

    let mut out = Vec::with_capacity(count as usize);
    for i in 0..count {
        let t = (i as f64 + 0.5) * (duration_seconds / count as f64);
        let thumb = dir.join(format!("t{:02}.jpg", i));
        if !thumb.is_file() {
            let mut cmd = Command::new("ffmpeg");
            cmd.args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                &format!("{:.3}", t),
                "-i",
                &input_path,
                "-frames:v",
                "1",
                "-vf",
                "scale=160:-2:flags=lanczos",
                "-q:v",
                "5",
                "-y",
                thumb.to_string_lossy().as_ref(),
            ]);
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::piped());
            #[cfg(windows)]
            cmd.creation_flags(0x08000000);

            let result = cmd.output().await.map_err(|e| e.to_string())?;
            if !result.status.success() {
                return Err(format!(
                    "ffmpeg thumbnail failed at {:.2}s: {}",
                    t,
                    String::from_utf8_lossy(&result.stderr)
                ));
            }
        }
        out.push(Thumbnail {
            path: thumb.to_string_lossy().to_string(),
            time_seconds: t,
        });
    }
    Ok(out)
}

fn hash_path_key(path: &str) -> String {
    // Cheap stable filename-safe hash from path + mtime.
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut hash: u64 = 1469598103934665603;
    for b in path.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    hash ^= mtime;
    hash = hash.wrapping_mul(1099511628211);
    format!("{:016x}", hash)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchEntry {
    pub path: String,
    pub size: u64,
    pub modified: u64,
}

#[tauri::command]
pub async fn list_media_files(path: String) -> Result<Vec<WatchEntry>, String> {
    const MEDIA_EXTS: &[&str] = &[
        "mp4", "mov", "mkv", "webm", "avi", "m4v", "mts", "m2ts", "mpg", "mpeg", "ts", "wmv",
        "flv", "3gp", "3g2", "ogv", "f4v",
        "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "wma", "aiff",
        "jpg", "jpeg", "png", "webp", "avif", "tiff", "tif", "bmp", "ico", "heic", "heif",
    ];
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        if !MEDIA_EXTS.contains(&ext.as_str()) {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            out.push(WatchEntry {
                path: p.to_string_lossy().to_string(),
                size: meta.len(),
                modified,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn reveal_file(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err("File not found".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(p.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(p.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        let folder = p.parent().unwrap_or(&p);
        std::process::Command::new("xdg-open")
            .arg(folder.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

fn binary_exists(name: &str) -> bool {
    let exe = if cfg!(windows) {
        format!("{}.exe", name)
    } else {
        name.to_string()
    };
    let sep = if cfg!(windows) { ';' } else { ':' };

    // 1. Check current process PATH
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in path_var.split(sep) {
            if dir.is_empty() {
                continue;
            }
            let candidate = std::path::PathBuf::from(dir).join(&exe);
            if candidate.is_file() {
                return true;
            }
        }
    }

    // 2. Windows-only: try known winget Links folder and re-read user PATH from registry,
    //    since winget edits the user environment registry but does not refresh running processes.
    #[cfg(windows)]
    {
        if let Some(found_dir) = find_windows_fallback(&exe) {
            // Prepend so future Command::new("ffmpeg") spawns find it without app restart
            let old = std::env::var("PATH").unwrap_or_default();
            if !old.split(';').any(|d| d.eq_ignore_ascii_case(&found_dir)) {
                let new_path = format!("{};{}", found_dir, old);
                std::env::set_var("PATH", new_path);
            }
            return true;
        }
    }

    false
}

#[cfg(windows)]
fn find_windows_fallback(exe: &str) -> Option<String> {
    // a. winget command-alias shim folder (where Gyan.FFmpeg installs its aliases)
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let winget_links = std::path::PathBuf::from(&local)
            .join("Microsoft")
            .join("WinGet")
            .join("Links");
        if winget_links.join(exe).is_file() {
            return Some(winget_links.to_string_lossy().to_string());
        }
    }

    // b. Common manual / Chocolatey install locations
    let manual_candidates = [
        r"C:\ProgramData\chocolatey\bin",
        r"C:\ffmpeg\bin",
        r"C:\Program Files\ffmpeg\bin",
    ];
    for dir in manual_candidates {
        let p = std::path::PathBuf::from(dir).join(exe);
        if p.is_file() {
            return Some(dir.to_string());
        }
    }

    // c. Re-read user PATH from the registry (winget edits this, but it isn't propagated to running processes)
    if let Some(reg_path) = read_user_path_from_registry() {
        for dir in reg_path.split(';') {
            if dir.is_empty() {
                continue;
            }
            // Expand %VAR% references
            let expanded = expand_env_vars(dir);
            let p = std::path::PathBuf::from(&expanded).join(exe);
            if p.is_file() {
                return Some(expanded);
            }
        }
    }

    None
}

#[cfg(windows)]
fn read_user_path_from_registry() -> Option<String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    let output = Command::new("reg")
        .args(["query", "HKCU\\Environment", "/v", "Path"])
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    // Output looks like:
    //
    // HKEY_CURRENT_USER\Environment
    //     Path    REG_EXPAND_SZ    C:\...;C:\...
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(idx) = trimmed.find("REG_") {
            let after = &trimmed[idx..];
            // skip past "REG_*_SZ" + whitespace to the value
            if let Some(val_idx) = after.find(|c: char| c == ' ' || c == '\t').and_then(|i| {
                after[i..]
                    .find(|c: char| c != ' ' && c != '\t')
                    .map(|j| i + j)
            }) {
                return Some(after[val_idx..].to_string());
            }
        }
    }
    None
}

#[cfg(windows)]
fn expand_env_vars(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut name = String::new();
            let mut closed = false;
            while let Some(&nc) = chars.peek() {
                chars.next();
                if nc == '%' {
                    closed = true;
                    break;
                }
                name.push(nc);
            }
            if closed {
                if let Ok(v) = std::env::var(&name) {
                    out.push_str(&v);
                    continue;
                } else {
                    out.push('%');
                    out.push_str(&name);
                    out.push('%');
                    continue;
                }
            } else {
                out.push('%');
                out.push_str(&name);
            }
        } else {
            out.push(c);
        }
    }
    out
}
