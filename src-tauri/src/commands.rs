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
    if let Ok(path_var) = std::env::var("PATH") {
        let sep = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(sep) {
            let candidate = std::path::PathBuf::from(dir).join(&exe);
            if candidate.is_file() {
                return true;
            }
        }
    }
    false
}
