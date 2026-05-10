# Format Reaper

Image, audio and video format converter. Powered by FFmpeg. Windows, macOS, Linux. Tauri + Rust.

## Features

- Convert between MP4, MOV, MKV, WebM, AVI, GIF, MP3, M4A, WAV, FLAC, OGG, Opus, JPG, PNG, WebP, AVIF, TIFF, BMP and more
- iPhone / iPad preset (HEVC, hvc1 tag, yuv420p, faststart) for AirDrop-friendly clips
- Drag-and-drop a whole batch of files at once
- Hardware acceleration (NVENC, QuickSync, VideoToolbox, VAAPI, AMF) auto-detected
- Lossless conversion toggle for codecs that support it
- Bitrate / CRF / quality / resolution / fps / preset controls
- Per-file probe (duration, codec, resolution, fps) before converting
- Strip metadata for safe sharing
- Live progress, ETA and speed for every job
- History of past conversions with redo and "reveal in folder"
- Debug panel with real-time FFmpeg logs, filterable, exportable to CSV/TXT

## Requirements

[FFmpeg](https://ffmpeg.org/) and `ffprobe` must be on PATH. Format Reaper does not bundle FFmpeg.

## Links

Made by [EERIE](https://eeriegoesd.com) - [Support This Project](https://buymeacoffee.com/eeriegoesd) - [Report Issue](https://github.com/EerieGoesD/format-reaper/issues/new?template=bug-report.md) - [Suggest Feature](https://github.com/EerieGoesD/format-reaper/issues/new?template=suggest-feature.md)
