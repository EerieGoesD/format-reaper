---
name: Bug Report
about: Report a problem with a conversion, the UI, or FFmpeg integration
title: "[BUG]"
labels: ''
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Add file '...' (drag-drop / Add Files / Add Folder)
2. Select preset '...' or set codec/quality '...'
3. Click 'Convert All'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Debug logs**
Enable Debug Mode in Settings, reproduce the issue, then export the logs from the Debug panel (CSV or TXT) and paste the relevant lines here, including the `FFMPEG` line with the full command.

**Source file**
 - Format / extension: [e.g. .mts, .mp4, .heic]
 - Codec (from probe): [e.g. h264 + aac, hevc, mjpeg]
 - Resolution / duration: [e.g. 1920x1080, 4 min 12 sec]
 - Approx. size: [e.g. 480 MB]

**Conversion settings**
 - Preset: [e.g. iPhone 4K HEVC, Custom]
 - Output container: [e.g. mp4, webm, jpg]
 - Video codec / CRF / bitrate: [e.g. libx265, CRF 20, 0 kbps]
 - Audio codec / bitrate: [e.g. aac, 192 kbps]
 - Resolution / fps: [e.g. keep, 30]
 - Lossless / iPhone compatible / Strip metadata / Hardware acceleration: [on/off]

**Desktop (please complete the following information):**
 - OS: [e.g. Windows 11 24H2, macOS 14.5, Ubuntu 24.04]
 - Format Reaper version: [e.g. 1.0.0]
 - FFmpeg version: [output of `ffmpeg -version` first line]
 - GPU / hardware encoder available: [e.g. NVIDIA RTX 4070 / NVENC, Apple M2 / VideoToolbox, none]

**Additional context**
Add any other context about the problem here (e.g. does it fail on every file or only some, does CPU-only mode work, was the source already a re-encode).
