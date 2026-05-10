use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionOptions {
    pub kind: String,
    pub container: String,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub video_bitrate_kbps: Option<u32>,
    pub audio_bitrate_kbps: Option<u32>,
    pub crf: Option<u32>,
    pub preset: Option<String>,
    pub lossless: bool,
    pub hw_accel: Option<String>,
    pub resolution: Option<String>,
    pub fps: Option<f32>,
    pub image_quality: Option<u32>,
    pub strip_metadata: bool,
    pub fast_start: bool,
    pub iphone_compatible: bool,
    #[serde(default)]
    pub deinterlace: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionJob {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub filename: String,
    pub output_format: String,
    pub kind: String,
    pub status: JobStatus,
    pub progress: f32,
    pub eta_seconds: u64,
    pub speed: String,
    pub duration_seconds: f64,
    pub input_size: u64,
    pub output_size: u64,
    pub elapsed_seconds: u64,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error: Option<String>,
    pub command: Option<String>,
    pub options: ConversionOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeInfo {
    pub duration_seconds: f64,
    pub width: u32,
    pub height: u32,
    pub video_codec: String,
    pub audio_codec: String,
    pub bitrate_kbps: u32,
    pub fps: f32,
    pub size_bytes: u64,
    pub kind: String,
}

pub struct ConversionManager {
    pub jobs: Arc<Mutex<Vec<ConversionJob>>>,
    pub running: Arc<Mutex<std::collections::HashMap<String, Arc<Mutex<Option<Child>>>>>>,
}

impl Clone for ConversionManager {
    fn clone(&self) -> Self {
        Self {
            jobs: self.jobs.clone(),
            running: self.running.clone(),
        }
    }
}

impl ConversionManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(Vec::new())),
            running: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    pub async fn add_job(
        &self,
        input_path: String,
        output_path: String,
        options: ConversionOptions,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        let filename = std::path::Path::new(&output_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "output".to_string());
        let output_format = options.container.clone();
        let kind = options.kind.clone();

        let input_size = std::fs::metadata(&input_path).map(|m| m.len()).unwrap_or(0);

        let mut duration_seconds = 0.0_f64;
        if options.kind == "video" || options.kind == "audio" {
            if let Ok(info) = probe(&input_path).await {
                duration_seconds = info.duration_seconds;
            }
        }

        let job = ConversionJob {
            id: id.clone(),
            input_path,
            output_path,
            filename,
            output_format,
            kind,
            status: JobStatus::Queued,
            progress: 0.0,
            eta_seconds: 0,
            speed: String::new(),
            duration_seconds,
            input_size,
            output_size: 0,
            elapsed_seconds: 0,
            started_at: None,
            completed_at: None,
            error: None,
            command: None,
            options,
        };

        self.jobs.lock().await.push(job);
        Ok(id)
    }

    pub async fn get_all(&self) -> Vec<ConversionJob> {
        self.jobs.lock().await.clone()
    }

    pub async fn cancel(&self, id: &str) {
        let child_opt = {
            let running = self.running.lock().await;
            running.get(id).cloned()
        };
        if let Some(child_handle) = child_opt {
            let mut guard = child_handle.lock().await;
            if let Some(mut child) = guard.take() {
                let _ = child.kill().await;
            }
        }
        let mut jobs = self.jobs.lock().await;
        if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
            if j.status == JobStatus::Running || j.status == JobStatus::Queued {
                j.status = JobStatus::Cancelled;
            }
        }
    }

    pub async fn remove(&self, id: &str) {
        self.cancel(id).await;
        let mut jobs = self.jobs.lock().await;
        jobs.retain(|j| j.id != id);
    }

    /// Start a conversion job. Pushes ConversionJob snapshots to `progress_tx` whenever state changes.
    pub async fn start_job(
        &self,
        id: String,
        progress_tx: mpsc::UnboundedSender<ConversionJob>,
    ) -> Result<(), String> {
        let (input_path, output_path, options, duration_seconds) = {
            let jobs = self.jobs.lock().await;
            let j = jobs
                .iter()
                .find(|j| j.id == id)
                .ok_or_else(|| "Job not found".to_string())?;
            (
                j.input_path.clone(),
                j.output_path.clone(),
                j.options.clone(),
                j.duration_seconds,
            )
        };

        let args = build_ffmpeg_args(&input_path, &output_path, &options);
        let command_str = format!("ffmpeg {}", quote_args(&args));

        if let Some(parent) = std::path::Path::new(&output_path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        // update job to Running and emit
        {
            let mut jobs = self.jobs.lock().await;
            if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
                j.status = JobStatus::Running;
                j.started_at = Some(chrono::Utc::now().to_rfc3339());
                j.command = Some(command_str.clone());
                let _ = progress_tx.send(j.clone());
            }
        }

        let mut cmd = Command::new("ffmpeg");
        cmd.args(&args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::null());

        #[cfg(windows)]
        cmd.creation_flags(0x08000000);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let mut jobs = self.jobs.lock().await;
                if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
                    j.status = JobStatus::Failed;
                    j.error = Some(format!("Failed to spawn ffmpeg: {}", e));
                    let _ = progress_tx.send(j.clone());
                }
                return Err(format!("Failed to spawn ffmpeg: {}", e));
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let child_handle = Arc::new(Mutex::new(Some(child)));
        {
            let mut running = self.running.lock().await;
            running.insert(id.clone(), child_handle.clone());
        }

        let jobs_for_progress = self.jobs.clone();
        let id_for_progress = id.clone();
        let dur = duration_seconds;
        let tx_for_progress = progress_tx.clone();

        let progress_handle = tokio::spawn(async move {
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout).lines();
                let mut out_time_ms: u64 = 0;
                let mut fps: f32 = 0.0;
                let mut speed_x: f32 = 0.0;
                let start = std::time::Instant::now();
                while let Ok(Some(line)) = reader.next_line().await {
                    let line = line.trim();
                    if let Some((k, v)) = line.split_once('=') {
                        match k {
                            "out_time_ms" | "out_time_us" => {
                                out_time_ms = v.parse::<u64>().unwrap_or(0) / 1000;
                            }
                            "fps" => {
                                fps = v.parse::<f32>().unwrap_or(0.0);
                            }
                            "speed" => {
                                let s = v.trim_end_matches('x').trim();
                                speed_x = s.parse::<f32>().unwrap_or(0.0);
                            }
                            "progress" => {
                                let mut jobs = jobs_for_progress.lock().await;
                                if let Some(j) = jobs.iter_mut().find(|j| j.id == id_for_progress) {
                                    let elapsed = start.elapsed().as_secs();
                                    j.elapsed_seconds = elapsed;
                                    if dur > 0.0 {
                                        let pct =
                                            ((out_time_ms as f64) / 1000.0 / dur * 100.0) as f32;
                                        j.progress = pct.clamp(0.0, 100.0);
                                        if speed_x > 0.0 {
                                            let remaining =
                                                dur - (out_time_ms as f64 / 1000.0);
                                            let eta = (remaining as f32
                                                / speed_x.max(0.01))
                                                .max(0.0) as u64;
                                            j.eta_seconds = eta;
                                        }
                                        j.speed = if speed_x > 0.0 {
                                            format!("{:.2}x", speed_x)
                                        } else if fps > 0.0 {
                                            format!("{:.0} fps", fps)
                                        } else {
                                            String::new()
                                        };
                                    } else if fps > 0.0 {
                                        j.speed = format!("{:.0} fps", fps);
                                    }
                                    if v == "end" {
                                        j.progress = 100.0;
                                    }
                                    let _ = tx_for_progress.send(j.clone());
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        });

        let stderr_buf = Arc::new(Mutex::new(String::new()));
        let stderr_buf_clone = stderr_buf.clone();
        let stderr_handle = tokio::spawn(async move {
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut buf = stderr_buf_clone.lock().await;
                    buf.push_str(&line);
                    buf.push('\n');
                    if buf.len() > 16384 {
                        let cut = buf.len() - 16384;
                        *buf = buf.split_off(cut);
                    }
                }
            }
        });

        let exit_status = {
            let mut guard = child_handle.lock().await;
            if let Some(child) = guard.as_mut() {
                child.wait().await.ok()
            } else {
                None
            }
        };

        let _ = progress_handle.await;
        let _ = stderr_handle.await;

        {
            let mut running = self.running.lock().await;
            running.remove(&id);
        }

        let mut jobs = self.jobs.lock().await;
        if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
            if j.status == JobStatus::Cancelled {
                let _ = progress_tx.send(j.clone());
                let _ = std::fs::remove_file(&j.output_path);
                return Ok(());
            }

            j.completed_at = Some(chrono::Utc::now().to_rfc3339());
            j.output_size = std::fs::metadata(&j.output_path)
                .map(|m| m.len())
                .unwrap_or(0);

            let success = exit_status.map(|s| s.success()).unwrap_or(false);
            if success && j.output_size > 0 {
                j.status = JobStatus::Completed;
                j.progress = 100.0;
                j.eta_seconds = 0;
            } else {
                j.status = JobStatus::Failed;
                let buf = stderr_buf.lock().await.clone();
                let last = buf.lines().rev().take(8).collect::<Vec<_>>();
                let msg = last.into_iter().rev().collect::<Vec<_>>().join("\n");
                j.error = Some(if msg.is_empty() {
                    "ffmpeg exited with an error".to_string()
                } else {
                    msg
                });
                let _ = std::fs::remove_file(&j.output_path);
            }
            let _ = progress_tx.send(j.clone());
        }

        Ok(())
    }
}

fn build_ffmpeg_args(input: &str, output: &str, opt: &ConversionOptions) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    args.push("-y".into());
    args.push("-hide_banner".into());
    args.push("-loglevel".into());
    args.push("error".into());
    args.push("-progress".into());
    args.push("pipe:1".into());
    args.push("-nostats".into());

    if let Some(hw) = &opt.hw_accel {
        let lc = hw.to_lowercase();
        if lc != "none" && !lc.is_empty() && lc != "auto" {
            args.push("-hwaccel".into());
            let dec = match lc.as_str() {
                "nvenc" => "cuda",
                "qsv" => "qsv",
                "videotoolbox" => "videotoolbox",
                "vaapi" => "vaapi",
                "amf" => "d3d11va",
                _ => "auto",
            };
            args.push(dec.into());
        }
    }

    args.push("-i".into());
    args.push(input.into());

    if opt.kind == "image" {
        if opt.strip_metadata {
            args.push("-map_metadata".into());
            args.push("-1".into());
        }
        let ext = opt.container.to_lowercase();
        let mut vf: Vec<String> = Vec::new();
        if let Some(res) = &opt.resolution {
            if res != "keep" && !res.is_empty() {
                if let Some((w, h)) = parse_resolution(res) {
                    vf.push(format!(
                        "scale={}:{}:force_original_aspect_ratio=decrease",
                        w, h
                    ));
                }
            }
        }
        match ext.as_str() {
            "jpg" | "jpeg" => {
                args.push("-c:v".into());
                args.push("mjpeg".into());
                let q = opt.image_quality.unwrap_or(90);
                let qscale = map_quality_to_qscale(q);
                args.push("-q:v".into());
                args.push(qscale.to_string());
                args.push("-pix_fmt".into());
                args.push("yuvj420p".into());
            }
            "png" => {
                args.push("-c:v".into());
                args.push("png".into());
                args.push("-compression_level".into());
                args.push("6".into());
            }
            "webp" => {
                args.push("-c:v".into());
                args.push("libwebp".into());
                if opt.lossless {
                    args.push("-lossless".into());
                    args.push("1".into());
                } else {
                    args.push("-quality".into());
                    args.push(opt.image_quality.unwrap_or(85).to_string());
                }
            }
            "avif" => {
                args.push("-c:v".into());
                args.push("libaom-av1".into());
                args.push("-still-picture".into());
                args.push("1".into());
                if opt.lossless {
                    args.push("-crf".into());
                    args.push("0".into());
                } else {
                    let q = opt.image_quality.unwrap_or(85);
                    let crf = 63 - ((q as f32 / 100.0) * 63.0) as u32;
                    args.push("-crf".into());
                    args.push(crf.to_string());
                }
            }
            "tiff" => {
                args.push("-c:v".into());
                args.push("tiff".into());
            }
            "bmp" => {
                args.push("-c:v".into());
                args.push("bmp".into());
            }
            "ico" => {
                vf.push("scale=256:256:force_original_aspect_ratio=decrease".into());
            }
            "gif" => {
                args.push("-c:v".into());
                args.push("gif".into());
            }
            _ => {}
        }
        if !vf.is_empty() {
            args.push("-vf".into());
            args.push(vf.join(","));
        }
        args.push("-frames:v".into());
        args.push("1".into());
        args.push(output.into());
        return args;
    }

    if opt.kind == "audio" {
        let codec = opt
            .audio_codec
            .clone()
            .unwrap_or_else(|| audio_codec_for_container(&opt.container).to_string());
        if codec != "copy" {
            args.push("-c:a".into());
            args.push(codec.clone());
            if let Some(br) = opt.audio_bitrate_kbps {
                if br > 0 {
                    args.push("-b:a".into());
                    args.push(format!("{}k", br));
                }
            }
        } else {
            args.push("-c".into());
            args.push("copy".into());
        }
        args.push("-vn".into());
        if opt.strip_metadata {
            args.push("-map_metadata".into());
            args.push("-1".into());
        }
        args.push(output.into());
        return args;
    }

    // Video
    let vcodec = opt
        .video_codec
        .clone()
        .unwrap_or_else(|| {
            video_codec_for_container(&opt.container, opt.iphone_compatible).to_string()
        });
    let acodec = opt
        .audio_codec
        .clone()
        .unwrap_or_else(|| audio_codec_for_container(&opt.container).to_string());

    let vcodec_final = swap_hw_encoder(&vcodec, opt.hw_accel.as_deref());

    if vcodec == "copy" {
        args.push("-c:v".into());
        args.push("copy".into());
    } else {
        args.push("-c:v".into());
        args.push(vcodec_final.clone());

        if let Some(preset) = &opt.preset {
            if !preset.is_empty() && !is_hw_encoder(&vcodec_final) {
                args.push("-preset".into());
                args.push(preset.clone());
            } else if is_hw_encoder(&vcodec_final) {
                // hw encoders use different preset names; map common ones
                if let Some(preset) = &opt.preset {
                    let mapped = match preset.as_str() {
                        "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" => "fast",
                        "medium" => "medium",
                        "slow" | "slower" | "veryslow" => "slow",
                        other => other,
                    };
                    args.push("-preset".into());
                    args.push(mapped.into());
                }
            }
        }

        if opt.lossless {
            if vcodec_final.contains("x264") {
                args.push("-qp".into());
                args.push("0".into());
            } else if vcodec_final.contains("x265") {
                args.push("-x265-params".into());
                args.push("lossless=1".into());
            } else if vcodec_final.contains("vp9") || vcodec_final.contains("aom") {
                args.push("-lossless".into());
                args.push("1".into());
            } else if vcodec_final.contains("nvenc") {
                args.push("-tune".into());
                args.push("lossless".into());
            }
        } else if let Some(br) = opt.video_bitrate_kbps {
            if br > 0 {
                args.push("-b:v".into());
                args.push(format!("{}k", br));
            } else if let Some(crf) = opt.crf {
                args.push("-crf".into());
                args.push(crf.to_string());
            }
        } else if let Some(crf) = opt.crf {
            args.push("-crf".into());
            args.push(crf.to_string());
        }

        if opt.iphone_compatible {
            args.push("-pix_fmt".into());
            args.push("yuv420p".into());
            if vcodec_final.contains("x265") || vcodec_final.contains("hevc") {
                args.push("-tag:v".into());
                args.push("hvc1".into());
            }
            args.push("-movflags".into());
            args.push("+faststart".into());
        } else if opt.fast_start && opt.container == "mp4" {
            args.push("-movflags".into());
            args.push("+faststart".into());
        }
    }

    let mut filters: Vec<String> = Vec::new();
    if opt.deinterlace {
        filters.push("yadif".into());
    }
    if let Some(res) = &opt.resolution {
        if res != "keep" && !res.is_empty() {
            if let Some((w, h)) = parse_resolution(res) {
                filters.push(format!("scale={}:{}:flags=lanczos", w, h));
            }
        }
    }
    if !filters.is_empty() {
        args.push("-vf".into());
        args.push(filters.join(","));
    }

    if let Some(fps) = opt.fps {
        if fps > 0.0 {
            args.push("-r".into());
            args.push(format!("{}", fps));
        }
    }

    if acodec == "copy" {
        args.push("-c:a".into());
        args.push("copy".into());
    } else {
        args.push("-c:a".into());
        args.push(acodec.clone());
        if let Some(br) = opt.audio_bitrate_kbps {
            if br > 0 {
                args.push("-b:a".into());
                args.push(format!("{}k", br));
            }
        }
    }

    if opt.strip_metadata {
        args.push("-map_metadata".into());
        args.push("-1".into());
    }

    args.push(output.into());
    args
}

fn parse_resolution(s: &str) -> Option<(i32, i32)> {
    match s {
        "iphone-4k" | "4k" => Some((3840, 2160)),
        "1440p" => Some((2560, 1440)),
        "1080p" => Some((1920, 1080)),
        "720p" => Some((1280, 720)),
        "480p" => Some((854, 480)),
        _ => {
            let parts: Vec<&str> = s.split(['x', 'X']).collect();
            if parts.len() == 2 {
                let w = parts[0].trim().parse::<i32>().ok()?;
                let h = parts[1].trim().parse::<i32>().ok()?;
                Some((w, h))
            } else {
                None
            }
        }
    }
}

fn video_codec_for_container(container: &str, iphone: bool) -> &'static str {
    match container {
        "mp4" => {
            if iphone {
                "libx265"
            } else {
                "libx264"
            }
        }
        "mov" => "libx264",
        "mkv" => "libx264",
        "webm" => "libvpx-vp9",
        "avi" => "mpeg4",
        "gif" => "gif",
        _ => "libx264",
    }
}

fn audio_codec_for_container(container: &str) -> &'static str {
    match container {
        "mp4" | "mov" | "mkv" | "m4a" => "aac",
        "webm" => "libopus",
        "avi" => "libmp3lame",
        "mp3" => "libmp3lame",
        "ogg" => "libvorbis",
        "wav" => "pcm_s16le",
        "flac" => "flac",
        "opus" => "libopus",
        _ => "aac",
    }
}

fn swap_hw_encoder(software: &str, hw: Option<&str>) -> String {
    let hw = match hw {
        Some(h) if h != "none" && !h.is_empty() && h != "auto" => h.to_lowercase(),
        _ => return software.to_string(),
    };
    match (software, hw.as_str()) {
        ("libx264", "nvenc") => "h264_nvenc".into(),
        ("libx265", "nvenc") => "hevc_nvenc".into(),
        ("libx264", "qsv") => "h264_qsv".into(),
        ("libx265", "qsv") => "hevc_qsv".into(),
        ("libx264", "videotoolbox") => "h264_videotoolbox".into(),
        ("libx265", "videotoolbox") => "hevc_videotoolbox".into(),
        ("libx264", "vaapi") => "h264_vaapi".into(),
        ("libx265", "vaapi") => "hevc_vaapi".into(),
        ("libx264", "amf") => "h264_amf".into(),
        ("libx265", "amf") => "hevc_amf".into(),
        _ => software.to_string(),
    }
}

fn is_hw_encoder(name: &str) -> bool {
    name.contains("_nvenc")
        || name.contains("_qsv")
        || name.contains("_videotoolbox")
        || name.contains("_vaapi")
        || name.contains("_amf")
}

fn map_quality_to_qscale(q: u32) -> u32 {
    let q = q.clamp(1, 100);
    let qf = q as f32;
    let scale = 31.0 - ((qf / 100.0) * 29.0);
    scale.round().clamp(2.0, 31.0) as u32
}

fn quote_args(args: &[String]) -> String {
    args.iter()
        .map(|a| {
            if a.contains(' ') || a.contains('\t') {
                format!("\"{}\"", a.replace('\"', "\\\""))
            } else {
                a.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub async fn probe(path: &str) -> Result<ProbeInfo, String> {
    let mut cmd = Command::new("ffprobe");
    cmd.args([
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        path,
    ]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    let mut info = ProbeInfo {
        duration_seconds: 0.0,
        width: 0,
        height: 0,
        video_codec: String::new(),
        audio_codec: String::new(),
        bitrate_kbps: 0,
        fps: 0.0,
        size_bytes: 0,
        kind: "unknown".into(),
    };

    if let Some(fmt) = json.get("format") {
        if let Some(d) = fmt.get("duration").and_then(|v| v.as_str()) {
            info.duration_seconds = d.parse::<f64>().unwrap_or(0.0);
        }
        if let Some(b) = fmt.get("bit_rate").and_then(|v| v.as_str()) {
            info.bitrate_kbps = (b.parse::<u64>().unwrap_or(0) / 1000) as u32;
        }
        if let Some(s) = fmt.get("size").and_then(|v| v.as_str()) {
            info.size_bytes = s.parse::<u64>().unwrap_or(0);
        }
    }

    let mut has_video = false;
    let mut has_audio = false;

    if let Some(streams) = json.get("streams").and_then(|v| v.as_array()) {
        for s in streams {
            let codec_type = s.get("codec_type").and_then(|v| v.as_str()).unwrap_or("");
            if codec_type == "video" {
                has_video = true;
                if info.video_codec.is_empty() {
                    info.video_codec = s
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    info.width = s.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    info.height = s.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    if let Some(r) = s.get("avg_frame_rate").and_then(|v| v.as_str()) {
                        info.fps = parse_rational(r);
                    }
                }
            } else if codec_type == "audio" {
                has_audio = true;
                if info.audio_codec.is_empty() {
                    info.audio_codec = s
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
        }
    }

    if has_video && info.duration_seconds < 0.05 && !has_audio {
        info.kind = "image".into();
    } else if has_video {
        info.kind = "video".into();
    } else if has_audio {
        info.kind = "audio".into();
    } else {
        info.kind = "unknown".into();
    }

    let lower = path.to_lowercase();
    let image_exts = [
        "jpg", "jpeg", "png", "webp", "avif", "tiff", "tif", "bmp", "ico", "heic", "heif",
    ];
    if image_exts.iter().any(|e| lower.ends_with(&format!(".{}", e))) {
        info.kind = "image".into();
    }

    Ok(info)
}

fn parse_rational(s: &str) -> f32 {
    if let Some((n, d)) = s.split_once('/') {
        let n = n.parse::<f32>().unwrap_or(0.0);
        let d = d.parse::<f32>().unwrap_or(1.0);
        if d == 0.0 {
            0.0
        } else {
            n / d
        }
    } else {
        s.parse::<f32>().unwrap_or(0.0)
    }
}
