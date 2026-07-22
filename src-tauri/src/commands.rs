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
    /// data:image/jpeg;base64,... - lets the webview render the thumb without the asset protocol.
    pub data_url: String,
}

#[tauri::command]
pub async fn extract_single_frame(
    input_path: String,
    time_seconds: f64,
    #[allow(unused_variables)] width: Option<u32>,
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    use std::process::Stdio;
    use tokio::process::Command;

    // Default 160px suits the trim strip, where latency matters more than sharpness.
    // Grid posters ask for more because they are displayed several times that size.
    let w = width.unwrap_or(160).clamp(64, 1280);
    let seek = format!("{:.3}", time_seconds.max(0.0));
    let scale = format!("scale={}:-2:flags=fast_bilinear", w);

    let mut cmd = Command::new("ffmpeg");
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        // Hardware-accelerated decode (cuda / qsv / d3d11va / videotoolbox / etc.)
        // -hwaccel auto falls back to software if nothing is available.
        "-hwaccel",
        "auto",
        // Fast seek BEFORE -i (container-level keyframe seek, ~10x faster than accurate seek)
        "-ss",
        &seek,
        "-i",
        &input_path,
        "-frames:v",
        "1",
        "-vf",
        &scale,
        "-q:v",
        "6",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
    ]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().await.map_err(|e| format!("spawn ffmpeg: {}", e))?;
    if !output.status.success() || output.stdout.is_empty() {
        return Err(format!(
            "ffmpeg frame extract failed at {:.2}s: {}",
            time_seconds,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let b64 = general_purpose::STANDARD.encode(&output.stdout);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewVideo {
    pub path: String,
    pub size: u64,
}

#[tauri::command]
pub async fn generate_preview_video(
    app: tauri::AppHandle,
    input_path: String,
) -> Result<PreviewVideo, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    let cache_root = dirs_next::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("format-reaper")
        .join("previews");
    std::fs::create_dir_all(&cache_root).map_err(|e| e.to_string())?;
    let key = hash_path_key(&input_path);
    let out_path = cache_root.join(format!("{}.mp4", key));

    // Cache hit
    if out_path.is_file() {
        if let Ok(meta) = std::fs::metadata(&out_path) {
            if meta.len() > 0 {
                let _ = app.emit(
                    "preview-video-ready",
                    serde_json::json!({
                        "inputPath": input_path,
                        "path": out_path.to_string_lossy().to_string(),
                        "size": meta.len(),
                    }),
                );
                return Ok(PreviewVideo {
                    path: out_path.to_string_lossy().to_string(),
                    size: meta.len(),
                });
            }
        }
    }

    // Pick a hardware encoder if available, fall back to libx264.
    let venc = if has_encoder("h264_nvenc").await {
        "h264_nvenc"
    } else if has_encoder("h264_qsv").await {
        "h264_qsv"
    } else if has_encoder("h264_amf").await {
        "h264_amf"
    } else if has_encoder("h264_videotoolbox").await {
        "h264_videotoolbox"
    } else {
        "libx264"
    };

    let mut cmd = Command::new("ffmpeg");
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-hwaccel",
        "auto",
        "-y",
        "-i",
        &input_path,
        "-vf",
        "scale=480:-2:flags=fast_bilinear",
        "-c:v",
        venc,
        "-preset",
        if venc == "libx264" { "veryfast" } else { "fast" },
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ac",
        "2",
        out_path.to_string_lossy().as_ref(),
    ]);
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().await.map_err(|e| format!("spawn ffmpeg: {}", e))?;
    if !output.status.success() {
        let _ = std::fs::remove_file(&out_path);
        return Err(format!(
            "Preview generation failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let size = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
    let _ = app.emit(
        "preview-video-ready",
        serde_json::json!({
            "inputPath": input_path,
            "path": out_path.to_string_lossy().to_string(),
            "size": size,
        }),
    );
    Ok(PreviewVideo {
        path: out_path.to_string_lossy().to_string(),
        size,
    })
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeEstimate {
    pub bytes: u64,
    /// How many seconds of source were actually encoded to produce this number.
    pub sampled_seconds: f64,
    /// True when the clip was short enough to encode whole, so `bytes` is the real size.
    pub exact: bool,
}

/// "HH:MM:SS", "MM:SS" or plain seconds -> seconds. Rejects NaN and infinity, which
/// f64's parser accepts from strings like "nan" and would otherwise poison every
/// comparison downstream.
fn parse_time_to_seconds(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let parts: Vec<&str> = s.split(':').collect();
    let secs = match parts.len() {
        1 => parts[0].parse::<f64>().ok()?,
        2 => parts[0].parse::<f64>().ok()? * 60.0 + parts[1].parse::<f64>().ok()?,
        3 => {
            parts[0].parse::<f64>().ok()? * 3600.0
                + parts[1].parse::<f64>().ok()? * 60.0
                + parts[2].parse::<f64>().ok()?
        }
        _ => return None,
    };
    if secs.is_finite() && secs >= 0.0 {
        Some(secs)
    } else {
        None
    }
}

/// The portion of the source that will actually be encoded, honouring any trim.
/// `duration` must already be finite and positive.
fn trimmed_range(opt: &ConversionOptions, duration: f64) -> (f64, f64) {
    let start = opt
        .trim_start
        .as_deref()
        .and_then(parse_time_to_seconds)
        .unwrap_or(0.0)
        .clamp(0.0, duration);
    let end = opt
        .trim_end
        .as_deref()
        .and_then(parse_time_to_seconds)
        .unwrap_or(duration)
        .clamp(0.0, duration);
    if end <= start {
        (0.0, duration)
    } else {
        (start, end)
    }
}

/// Estimate the output size by encoding short samples with the caller's real settings
/// and extrapolating. CRF and lossless have no fixed size relationship to the source,
/// so measuring is the only honest way to predict them.
#[tauri::command]
pub async fn estimate_output_size(
    input_path: String,
    duration_seconds: f64,
    options: ConversionOptions,
) -> Result<SizeEstimate, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    if !duration_seconds.is_finite() || duration_seconds <= 0.0 {
        return Err("source has no usable duration".into());
    }

    let (range_start, range_end) = trimmed_range(&options, duration_seconds);
    let range_len = range_end - range_start;
    if range_len <= 0.0 {
        return Err("nothing left after trim".into());
    }

    let tmp_root = std::env::temp_dir().join("format-reaper").join("estimates");
    std::fs::create_dir_all(&tmp_root).map_err(|e| e.to_string())?;

    // Below this, encoding the whole thing costs about the same as sampling it
    // and gives the real answer instead of an estimate.
    const ENCODE_WHOLE_BELOW: f64 = 12.0;
    const MIN_SAMPLED: f64 = 8.0;
    const MAX_SAMPLED: f64 = 20.0;
    // Each sample is an independent encode, so it opens with a forced keyframe that the
    // real encode would only spend once every few hundred frames. Windows shorter than
    // this let that one frame dominate the measurement.
    const MIN_WINDOW: f64 = 1.5;
    const MAX_WINDOWS: usize = 10;

    // The two encoder families need opposite sampling.
    //
    // Software CRF spends bits according to how busy the picture is, and footage can
    // swing about 2x within a single clip, so the samples have to be spread out to
    // average it. Hardware encoders currently never receive the quality setting at all
    // (build_ffmpeg_args emits -crf, which nvenc/qsv/amf ignore), so they hold a roughly
    // constant bitrate and content barely matters - but each separate encode pays a
    // rate-control ramp, which many short windows amplify. One long window suits them.
    //
    // If the hardware quality mapping is ever fixed (-cq / -global_quality), hardware
    // output will start tracking content too and this branch should be revisited.
    let hw = crate::converter::uses_hw_encoder(&options);

    let exact = range_len <= ENCODE_WHOLE_BELOW;
    let windows: Vec<(f64, f64)> = if exact {
        vec![(range_start, range_len)]
    } else if hw {
        let w = (range_len * 0.25).clamp(MIN_SAMPLED, MAX_SAMPLED);
        vec![(range_start + (range_len - w) / 2.0, w)]
    } else {
        let sampled = (range_len * 0.20).clamp(MIN_SAMPLED, MAX_SAMPLED);
        // Spend the sampling budget on fewer, longer windows rather than let any
        // window fall under MIN_WINDOW.
        let count = ((sampled / MIN_WINDOW).floor() as usize).clamp(1, MAX_WINDOWS);
        let w = sampled / count as f64;
        (0..count)
            .map(|i| {
                let frac = (i as f64 + 0.5) / count as f64;
                (range_start + (range_len - w) * frac, w)
            })
            .collect()
    };

    let ext = if options.container.is_empty() {
        "mp4"
    } else {
        options.container.as_str()
    };
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    // A container that muxed no frames at all still weighs a few hundred bytes. Counting
    // one of those as a full window of footage would drag the whole rate down, so anything
    // this small is treated as "produced nothing" rather than as cheap footage.
    const MIN_USEFUL_BYTES: u64 = 1024;

    // Loop-invariant: the input path and its mtime cannot change while we sample.
    let path_key = hash_path_key(&input_path);

    // Let build_ffmpeg_args produce the real command, then swap its accurate-seek trim
    // for a fast seek. Accurate seek decodes from frame zero, which would take minutes
    // to reach the middle of a long file.
    let mut sample_opt = options.clone();
    sample_opt.trim_start = None;
    sample_opt.trim_end = None;

    let mut total_bytes: u64 = 0;
    let mut total_secs: f64 = 0.0;
    let mut last_error: Option<String> = None;

    for (i, (start, len)) in windows.iter().enumerate() {
        let out_path = tmp_root.join(format!("{}-{}-{}.{}", path_key, stamp, i, ext));

        let mut args = crate::converter::build_ffmpeg_args(
            &input_path,
            out_path.to_string_lossy().as_ref(),
            &sample_opt,
        );
        // Progress reporting exists for the live conversion's parser; nothing reads it here.
        if let Some(p) = args.iter().position(|a| a == "-progress") {
            args.drain(p..=p + 1);
        }
        args.retain(|a| a != "-nostats");

        let i_idx = args
            .iter()
            .position(|a| a == "-i")
            .ok_or_else(|| "malformed ffmpeg args".to_string())?;
        args.insert(i_idx, format!("{:.3}", start));
        args.insert(i_idx, "-ss".into());
        // "-ss" <start> "-i" <input> now occupy i_idx through i_idx+3, so the duration
        // cap goes immediately after the input path, at i_idx+4.
        args.insert(i_idx + 4, format!("{:.3}", len));
        args.insert(i_idx + 4, "-t".into());

        let mut cmd = Command::new("ffmpeg");
        cmd.args(&args);
        cmd.stdin(Stdio::null());
        cmd.stderr(Stdio::piped());
        cmd.kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);

        let output = cmd
            .output()
            .await
            .map_err(|e| format!("spawn ffmpeg: {}", e))?;

        if output.status.success() {
            if let Ok(meta) = std::fs::metadata(&out_path) {
                if meta.len() >= MIN_USEFUL_BYTES {
                    total_bytes += meta.len();
                    total_secs += len;
                }
            }
        } else {
            // One bad window (a corrupt GOP, a window past a truncated stream) should not
            // throw away the windows that did work. Only give up if none of them did.
            let stderr = String::from_utf8_lossy(&output.stderr);
            last_error = Some(
                stderr
                    .lines()
                    .rev()
                    .find(|l| !l.trim().is_empty())
                    .unwrap_or("unknown error")
                    .to_string(),
            );
        }
        let _ = std::fs::remove_file(&out_path);
    }

    if total_secs <= 0.0 || total_bytes == 0 {
        return Err(match last_error {
            Some(e) => format!("sample encode failed: {}", e),
            None => "sample encode produced nothing".into(),
        });
    }

    // When the whole range was encoded, total_secs == range_len and this is the real size.
    let bytes = ((total_bytes as f64 / total_secs) * range_len).round() as u64;

    Ok(SizeEstimate {
        bytes,
        sampled_seconds: total_secs,
        exact,
    })
}

async fn has_encoder(name: &str) -> bool {
    use std::process::Stdio;
    use tokio::process::Command;
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-encoders"]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    if let Ok(out) = cmd.output().await {
        return String::from_utf8_lossy(&out.stdout).contains(name);
    }
    false
}

/// The shipped build number, so the footer can show what the user is actually running.
/// Comes from Cargo.toml, which is kept in step with tauri.conf.json's version.
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("read {}: {}", path, e))
}

fn jpeg_to_data_url(path: &std::path::Path) -> Option<String> {
    use base64::{engine::general_purpose, Engine as _};
    let bytes = std::fs::read(path).ok()?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
pub async fn extract_thumbnails(
    app: tauri::AppHandle,
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

    // Spawn one ffmpeg per thumbnail in parallel via JoinSet.
    // Each emits "thumbnail-ready" as soon as it finishes so the UI can
    // populate the timeline progressively instead of waiting for all N.
    let mut set = tokio::task::JoinSet::new();
    for i in 0..count {
        let t = (i as f64 + 0.5) * (duration_seconds / count as f64);
        let thumb_path = dir.join(format!("t{:02}.jpg", i));
        let input = input_path.clone();
        let app_clone = app.clone();
        let input_for_event = input_path.clone();
        set.spawn(async move {
            if !thumb_path.is_file() {
                let mut cmd = Command::new("ffmpeg");
                cmd.args([
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    &format!("{:.3}", t),
                    "-i",
                    &input,
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=128:-2:flags=fast_bilinear",
                    "-q:v",
                    "7",
                    "-y",
                    thumb_path.to_string_lossy().as_ref(),
                ]);
                cmd.stdout(Stdio::null());
                cmd.stderr(Stdio::piped());
                #[cfg(windows)]
                cmd.creation_flags(0x08000000);

                let result = cmd
                    .output()
                    .await
                    .map_err(|e| format!("spawn ffmpeg: {}", e))?;
                if !result.status.success() {
                    return Err::<(u32, std::path::PathBuf, f64, String), String>(format!(
                        "ffmpeg thumbnail failed at {:.2}s: {}",
                        t,
                        String::from_utf8_lossy(&result.stderr)
                    ));
                }
            }
            let data_url = jpeg_to_data_url(&thumb_path).unwrap_or_default();
            // Emit progressive event keyed by the source input path so the UI can route it.
            let _ = app_clone.emit(
                "thumbnail-ready",
                serde_json::json!({
                    "inputPath": input_for_event,
                    "index": i,
                    "path": thumb_path.to_string_lossy().to_string(),
                    "timeSeconds": t,
                    "dataUrl": data_url,
                }),
            );
            Ok::<(u32, std::path::PathBuf, f64, String), String>((i, thumb_path, t, data_url))
        });
    }

    let mut results: Vec<(u32, std::path::PathBuf, f64, String)> = Vec::with_capacity(count as usize);
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok(Ok(t)) => results.push(t),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(format!("join error: {}", e)),
        }
    }
    results.sort_by_key(|r| r.0);
    Ok(results
        .into_iter()
        .map(|(_, p, t, du)| Thumbnail {
            path: p.to_string_lossy().to_string(),
            time_seconds: t,
            data_url: du,
        })
        .collect())
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
pub async fn open_with_default_app(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err("File not found".into());
    }
    #[cfg(windows)]
    {
        // `start` is a cmd builtin so we shell out via cmd /C.
        // First arg "" is the window title (required because start treats the first quoted arg as title).
        std::process::Command::new("cmd")
            .args(["/C", "start", "", p.to_string_lossy().as_ref()])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(p.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(p.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
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
