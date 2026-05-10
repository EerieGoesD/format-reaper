const { invoke } = window.__TAURI__.core;
const { listen, getCurrent: getCurrentWebview } = window.__TAURI__.event;
const dialog = window.__TAURI__.dialog;
const webviewWindow = window.__TAURI__.webviewWindow;
const tauriEvent = window.__TAURI__.event;

// State
let jobs = [];
let history = JSON.parse(localStorage.getItem('fr_history') || '[]');
let defaultOutputDir = '';
let availableHwAccels = [];

let settings = {
  outputDir: localStorage.getItem('fr_outputDir') || '',
  namingMode: localStorage.getItem('fr_namingMode') || 'suffix',
  autoClear: localStorage.getItem('fr_autoClear') === 'true',
  openFolder: localStorage.getItem('fr_openFolder') === 'true',
  overwrite: localStorage.getItem('fr_overwrite') === 'true',
  maxConcurrent: parseInt(localStorage.getItem('fr_maxConcurrent') || '1', 10),
  defaultHwAccel: localStorage.getItem('fr_defaultHwAccel') || 'auto',
  debug: localStorage.getItem('fr_debug') === 'true',
  preset: localStorage.getItem('fr_preset') || 'iphone',
};

let formState = {
  lossless: false,
  iphone: true,
  metadata: false,
  hw: true,
};

const debugFilters = { info: true, warn: true, error: true, event: true, ffmpeg: true };
const historyFilters = { Completed: true, Failed: true, Cancelled: true };

// DOM
const $ = (s) => document.querySelector(s);
const jobList = $('#jobList');
const emptyState = $('#emptyState');
const addFilesBtn = $('#addFilesBtn');
const addFolderBtn = $('#addFolderBtn');
const convertAllBtn = $('#convertAllBtn');
const cancelAllBtn = $('#cancelAllBtn');
const clearCompletedBtn = $('#clearCompletedBtn');
const globalStatus = $('#globalStatus');
const ffmpegStatus = $('#ffmpegStatus');
const outputDirInput = $('#outputDir');
const browseDirBtn = $('#browseDirBtn');
const formatSelect = $('#formatSelect');

const videoOptionsRow = $('#videoOptionsRow');
const videoOptionsRow2 = $('#videoOptionsRow2');
const imageOptionsRow = $('#imageOptionsRow');
const audioOptionsRow = $('#audioOptionsRow');

const videoCodec = $('#videoCodec');
const audioCodec = $('#audioCodec');
const crfInput = $('#crf');
const vbitrateInput = $('#vbitrate');
const abitrateInput = $('#abitrate');
const presetSelect = $('#preset');
const resolutionSelect = $('#resolution');
const fpsSelect = $('#fps');
const imageQualityInput = $('#imageQuality');
const imageResolutionSelect = $('#imageResolution');
const audioOnlyCodec = $('#audioOnlyCodec');
const audioOnlyBitrate = $('#audioOnlyBitrate');

const overallProgress = $('#overallProgress');
const overallText = $('#overallText');
const overallPct = $('#overallPct');
const overallBar = $('#overallBar');

const footerActive = $('#footerActive');
const footerCompleted = $('#footerCompleted');
const footerSaved = $('#footerSaved');

const dropOverlay = $('#dropOverlay');
const toastContainer = $('#toastContainer');

const debugLog = $('#debugLog');
let debugLogs = [];
const navDebug = $('#navDebug');

// Constants
const VIDEO_EXTS = ['mp4','mov','mkv','webm','avi','m4v','mpeg','mpg','mts','m2ts','ts','flv','wmv','3gp','3g2','vob','ogv','f4v','rm','rmvb'];
const AUDIO_EXTS = ['mp3','m4a','aac','wav','flac','ogg','opus','wma','aiff','ape','alac'];
const IMAGE_EXTS = ['jpg','jpeg','png','webp','avif','tiff','tif','bmp','ico','gif','heic','heif'];

const VIDEO_FORMATS = ['mp4','mov','mkv','webm','avi','gif'];
const AUDIO_FORMATS = ['mp3','m4a','wav','flac','opus','ogg'];
const IMAGE_FORMATS = ['jpg','png','webp','avif','tiff','bmp'];

function classifyExt(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return 'unknown';
}

function basename(path) {
  return path.replace(/^.*[\\/]/, '');
}
function stem(filename) {
  const i = filename.lastIndexOf('.');
  return i === -1 ? filename : filename.substring(0, i);
}
function joinPath(dir, name) {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}

function fmtBytes(n) {
  if (!n || n <= 0) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 10 ? 0 : 1) + ' ' + units[i];
}
function fmtTime(s) {
  if (s == null || !isFinite(s) || s <= 0) return '--';
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + Math.round(s%60) + 's';
  return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
}

// Debug logging
function dlog(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg: String(msg) };
  debugLogs.push(entry);
  if (debugLogs.length > 2000) debugLogs = debugLogs.slice(-2000);
  if (settings.debug) renderDebug();
}

function renderDebug() {
  const search = ($('#debugSearch').value || '').toLowerCase();
  const filtered = debugLogs.filter(e =>
    debugFilters[e.level] && (!search || e.msg.toLowerCase().includes(search))
  );
  if (filtered.length === 0) {
    debugLog.innerHTML = '<div class="debug-empty">No logs match the current filters.</div>';
    return;
  }
  const wasAtBottom = debugLog.scrollTop + debugLog.clientHeight >= debugLog.scrollHeight - 40;
  debugLog.innerHTML = filtered.map(e => {
    const ts = e.ts.split('T')[1].replace('Z','').split('.')[0];
    const tag = e.level.toUpperCase();
    const safe = e.msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="debug-line lvl-${e.level}"><span class="ts">${ts}</span><span class="tag">${tag}</span><span class="msg">${safe}</span></div>`;
  }).join('');
  if (wasAtBottom) debugLog.scrollTop = debugLog.scrollHeight;
}

// Toasts
function toast(title, msg, type = 'info', timeout = 4000) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'error' ? 'error' : type === 'warn' ? 'warn' : type === 'success' ? 'success' : '');
  const icon = type === 'error' ? '⚠' : type === 'warn' ? '⚠' : type === 'success' ? '✓' : 'i';
  el.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-msg">${escapeHtml(msg)}</div>
    </div>
    <button class="toast-close">✕</button>
  `;
  el.querySelector('.toast-close').addEventListener('click', () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 220);
  });
  toastContainer.appendChild(el);
  if (timeout > 0) {
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 220);
    }, timeout);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const panel = document.getElementById('panel-' + item.dataset.panel);
    if (panel) panel.classList.add('active');
    if (item.dataset.panel === 'debug') renderDebug();
    if (item.dataset.panel === 'history') renderHistory();
  });
});

// Footer links
$('#linkEerie').addEventListener('click', (e) => { e.preventDefault(); openUrl('https://eeriegoesd.com'); });
$('#linkCoffee').addEventListener('click', (e) => { e.preventDefault(); openUrl('https://buymeacoffee.com/eeriegoesd'); });
$('#linkIssue').addEventListener('click', (e) => { e.preventDefault(); openUrl('https://github.com/EerieGoesD/format-reaper/issues/new?template=bug-report.md'); });
$('#linkFeedback').addEventListener('click', (e) => { e.preventDefault(); openUrl('https://github.com/EerieGoesD/format-reaper/issues/new?template=suggest-feature.md'); });

async function openUrl(url) {
  try {
    const shell = window.__TAURI__.shell;
    if (shell && shell.open) {
      await shell.open(url);
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    dlog('warn', 'Failed to open URL: ' + e);
  }
}

// Toggles
function bindToggle(wrapId, checkId, key) {
  const wrap = document.getElementById(wrapId);
  const check = document.getElementById(checkId);
  if (!wrap || !check) return;
  function paint() { check.classList.toggle('on', !!formState[key]); }
  paint();
  wrap.addEventListener('click', () => {
    formState[key] = !formState[key];
    paint();
    onFormChange();
  });
}
bindToggle('losslessToggleWrap', 'losslessCheck', 'lossless');
bindToggle('iphoneToggleWrap', 'iphoneCheck', 'iphone');
bindToggle('metadataToggleWrap', 'metadataCheck', 'metadata');
bindToggle('hwToggleWrap', 'hwCheck', 'hw');

// Settings toggles
function bindSettingToggle(wrapId, checkId, key, persistKey) {
  const wrap = document.getElementById(wrapId);
  const check = document.getElementById(checkId);
  if (!wrap || !check) return;
  function paint() { check.classList.toggle('on', !!settings[key]); }
  paint();
  wrap.addEventListener('click', () => {
    settings[key] = !settings[key];
    localStorage.setItem(persistKey, String(settings[key]));
    paint();
    if (key === 'debug') updateDebugVisibility();
  });
}
bindSettingToggle('autoClearToggleSettings', 'autoClearCheckSettings', 'autoClear', 'fr_autoClear');
bindSettingToggle('openFolderToggleSettings', 'openFolderCheckSettings', 'openFolder', 'fr_openFolder');
bindSettingToggle('overwriteToggleSettings', 'overwriteCheckSettings', 'overwrite', 'fr_overwrite');
bindSettingToggle('debugToggleWrap', 'debugCheck', 'debug', 'fr_debug');

function updateDebugVisibility() {
  navDebug.style.display = settings.debug ? 'flex' : 'none';
  if (settings.debug) renderDebug();
}
updateDebugVisibility();

// Preset selection
document.querySelectorAll('.preset-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    settings.preset = pill.dataset.preset;
    localStorage.setItem('fr_preset', settings.preset);
    applyPreset(settings.preset);
  });
});

function applyPreset(preset) {
  dlog('event', `Applied preset: ${preset}`);
  switch (preset) {
    case 'iphone':
      formatSelect.value = 'mp4';
      videoCodec.value = 'libx265';
      crfInput.value = '20';
      vbitrateInput.value = '0';
      presetSelect.value = 'medium';
      resolutionSelect.value = 'keep';
      fpsSelect.value = '0';
      audioCodec.value = 'aac';
      abitrateInput.value = '192';
      formState.iphone = true;
      formState.lossless = false;
      formState.hw = true;
      break;
    case 'iphone-1080':
      formatSelect.value = 'mp4';
      videoCodec.value = 'libx265';
      crfInput.value = '22';
      vbitrateInput.value = '0';
      presetSelect.value = 'medium';
      resolutionSelect.value = '1080p';
      fpsSelect.value = '0';
      audioCodec.value = 'aac';
      abitrateInput.value = '192';
      formState.iphone = true;
      formState.lossless = false;
      formState.hw = true;
      break;
    case 'mp4-h264':
      formatSelect.value = 'mp4';
      videoCodec.value = 'libx264';
      crfInput.value = '20';
      presetSelect.value = 'medium';
      audioCodec.value = 'aac';
      abitrateInput.value = '192';
      formState.iphone = false;
      formState.lossless = false;
      break;
    case 'webm':
      formatSelect.value = 'webm';
      videoCodec.value = 'libvpx-vp9';
      crfInput.value = '30';
      vbitrateInput.value = '0';
      audioCodec.value = 'libopus';
      abitrateInput.value = '128';
      formState.iphone = false;
      formState.lossless = false;
      break;
    case 'audio-mp3':
      formatSelect.value = 'mp3';
      audioOnlyCodec.value = 'libmp3lame';
      audioOnlyBitrate.value = '320';
      break;
    case 'lossless':
      formatSelect.value = 'mkv';
      videoCodec.value = 'libx265';
      formState.lossless = true;
      formState.iphone = false;
      audioCodec.value = 'copy';
      break;
    case 'custom':
      // no overrides
      break;
  }
  refreshToggles();
  onFormChange();
}

function refreshToggles() {
  $('#losslessCheck').classList.toggle('on', formState.lossless);
  $('#iphoneCheck').classList.toggle('on', formState.iphone);
  $('#metadataCheck').classList.toggle('on', formState.metadata);
  $('#hwCheck').classList.toggle('on', formState.hw);
}

function formatKind(fmt) {
  if (VIDEO_FORMATS.includes(fmt)) return 'video';
  if (AUDIO_FORMATS.includes(fmt)) return 'audio';
  if (IMAGE_FORMATS.includes(fmt)) return 'image';
  return 'video';
}

function onFormChange() {
  const fmt = formatSelect.value;
  const kind = formatKind(fmt);
  videoOptionsRow.style.display = kind === 'video' ? 'flex' : 'none';
  videoOptionsRow2.style.display = kind === 'video' ? 'flex' : 'none';
  imageOptionsRow.style.display = kind === 'image' ? 'flex' : 'none';
  audioOptionsRow.style.display = kind === 'audio' ? 'flex' : 'none';
}
formatSelect.addEventListener('change', () => { onFormChange(); });
videoCodec.addEventListener('change', onFormChange);

// File input
addFilesBtn.addEventListener('click', async () => {
  try {
    const selected = await dialog.open({
      multiple: true,
      filters: [
        { name: 'All media', extensions: [...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS] },
        { name: 'Video', extensions: VIDEO_EXTS },
        { name: 'Audio', extensions: AUDIO_EXTS },
        { name: 'Image', extensions: IMAGE_EXTS },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (Array.isArray(selected)) {
      for (const p of selected) await addFileToQueue(p);
    } else if (typeof selected === 'string') {
      await addFileToQueue(selected);
    }
  } catch (e) {
    dlog('error', 'Failed to pick files: ' + e);
  }
});

addFolderBtn.addEventListener('click', async () => {
  try {
    const folder = await dialog.open({ directory: true, multiple: false });
    if (typeof folder === 'string') {
      // Tauri can't list folder contents from JS directly; the user can drag-drop instead.
      toast('Folder added', 'Drag-and-drop the files from the folder, or add files individually.', 'info');
      dlog('warn', 'Folder picker chosen; folder listing not yet wired up: ' + folder);
    }
  } catch (e) {
    dlog('error', 'Folder pick failed: ' + e);
  }
});

browseDirBtn.addEventListener('click', async () => {
  try {
    const folder = await dialog.open({ directory: true, multiple: false });
    if (typeof folder === 'string') {
      outputDirInput.value = folder;
      settings.outputDir = folder;
      localStorage.setItem('fr_outputDir', folder);
    }
  } catch (e) {
    dlog('error', 'Output picker failed: ' + e);
  }
});

// Drag-and-drop via Tauri event
async function setupDragDrop() {
  try {
    const wv = webviewWindow ? webviewWindow.getCurrentWebviewWindow() : null;
    if (wv && wv.onDragDropEvent) {
      await wv.onDragDropEvent(async (event) => {
        const p = event.payload;
        const type = p && p.type;
        if (type === 'over' || type === 'enter') {
          dropOverlay.classList.add('active');
        } else if (type === 'drop') {
          dropOverlay.classList.remove('active');
          const paths = p.paths || [];
          for (const path of paths) await addFileToQueue(path);
        } else if (type === 'leave' || type === 'cancel') {
          dropOverlay.classList.remove('active');
        }
      });
    } else {
      // Fallback to older tauri event name
      await listen('tauri://file-drop', async (e) => {
        dropOverlay.classList.remove('active');
        const paths = e.payload || [];
        for (const path of paths) await addFileToQueue(path);
      });
      await listen('tauri://file-drop-hover', () => dropOverlay.classList.add('active'));
      await listen('tauri://file-drop-cancelled', () => dropOverlay.classList.remove('active'));
    }
  } catch (e) {
    dlog('warn', 'Drag-drop hook failed: ' + e);
  }
}

async function addFileToQueue(filePath) {
  const filename = basename(filePath);
  const guessedKind = classifyExt(filename);
  if (guessedKind === 'unknown') {
    dlog('warn', `Unknown file extension, ignoring: ${filename}`);
    toast('Unsupported file', filename, 'warn');
    return;
  }
  let probeInfo = null;
  try {
    probeInfo = await invoke('probe_file', { path: filePath });
    dlog('info', `Probed ${filename}: ${probeInfo.kind} ${probeInfo.width}x${probeInfo.height} ${probeInfo.duration_seconds || probeInfo.durationSeconds || 0}s codec=${probeInfo.video_codec || probeInfo.videoCodec} audio=${probeInfo.audio_codec || probeInfo.audioCodec}`);
  } catch (e) {
    dlog('warn', `Probe failed for ${filename}: ${e}`);
  }

  const kind = (probeInfo && (probeInfo.kind)) || guessedKind;

  // Auto-select output format to match the current format dropdown's kind, or fall back
  const currentFmt = formatSelect.value;
  if (formatKind(currentFmt) !== kind) {
    // Choose a sensible default per kind
    if (kind === 'video') formatSelect.value = 'mp4';
    else if (kind === 'audio') formatSelect.value = 'mp3';
    else if (kind === 'image') formatSelect.value = 'jpg';
    onFormChange();
  }

  const job = {
    id: 'local-' + Math.random().toString(36).slice(2),
    inputPath: filePath,
    filename,
    kind,
    probe: probeInfo,
    status: 'Pending',
    progress: 0,
    elapsedSeconds: 0,
    inputSize: probeInfo ? (probeInfo.size_bytes || probeInfo.sizeBytes || 0) : 0,
    outputSize: 0,
    eta: 0,
    speed: '',
    serverId: null,
    error: null,
    command: null,
    duration: probeInfo ? (probeInfo.duration_seconds || probeInfo.durationSeconds || 0) : 0,
  };
  jobs.push(job);
  renderJobs();
  dlog('event', `Added to queue: ${filename}`);
}

function buildOptions(kind) {
  const fmt = formatSelect.value;
  const opt = {
    kind,
    container: fmt,
    videoCodec: null,
    audioCodec: null,
    videoBitrateKbps: null,
    audioBitrateKbps: null,
    crf: null,
    preset: null,
    lossless: !!formState.lossless,
    hwAccel: null,
    resolution: null,
    fps: null,
    imageQuality: null,
    stripMetadata: !!formState.metadata,
    fastStart: true,
    iphoneCompatible: !!formState.iphone,
  };

  if (formState.hw) {
    if (settings.defaultHwAccel === 'auto') {
      opt.hwAccel = availableHwAccels[0] || 'none';
    } else {
      opt.hwAccel = settings.defaultHwAccel;
    }
  } else {
    opt.hwAccel = 'none';
  }

  if (kind === 'video') {
    if (videoCodec.value !== 'auto') opt.videoCodec = videoCodec.value;
    if (audioCodec.value !== 'auto') opt.audioCodec = audioCodec.value;
    opt.crf = parseInt(crfInput.value, 10) || null;
    const vb = parseInt(vbitrateInput.value, 10) || 0;
    if (vb > 0) opt.videoBitrateKbps = vb;
    const ab = parseInt(abitrateInput.value, 10) || 0;
    if (ab > 0) opt.audioBitrateKbps = ab;
    opt.preset = presetSelect.value || null;
    opt.resolution = resolutionSelect.value || 'keep';
    const f = parseFloat(fpsSelect.value || '0');
    if (f > 0) opt.fps = f;
  } else if (kind === 'audio') {
    if (audioOnlyCodec.value !== 'auto') opt.audioCodec = audioOnlyCodec.value;
    const ab = parseInt(audioOnlyBitrate.value, 10) || 0;
    if (ab > 0) opt.audioBitrateKbps = ab;
  } else if (kind === 'image') {
    opt.imageQuality = parseInt(imageQualityInput.value, 10) || 90;
    opt.resolution = imageResolutionSelect.value || 'keep';
  }
  return opt;
}

function computeOutputPath(inputPath, outFormat, kind) {
  const filename = basename(inputPath);
  const base = stem(filename);
  let dir = settings.outputDir || outputDirInput.value || defaultOutputDir;
  if (!dir) {
    // fall back to same folder as input
    dir = inputPath.replace(/[\\/][^\\/]+$/, '');
  }
  let outName;
  if (settings.namingMode === 'same') {
    outName = `${base}.${outFormat}`;
  } else if (settings.namingMode === 'timestamp') {
    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    outName = `${base}_${ts}.${outFormat}`;
  } else {
    // suffix
    let suffix = outFormat;
    if (kind === 'video') {
      const vc = videoCodec.value;
      if (vc === 'libx265') suffix = 'h265';
      else if (vc === 'libx264') suffix = 'h264';
      else if (vc === 'libvpx-vp9') suffix = 'vp9';
      else if (vc === 'libaom-av1') suffix = 'av1';
    }
    outName = `${base}_${suffix}.${outFormat}`;
  }
  let out = joinPath(dir, outName);

  if (!settings.overwrite) {
    // append -1, -2 if exists - we cannot stat from JS; let backend handle real existence.
    // For simplicity, only adjust if the name collides with another queued/finished job output.
    let n = 1;
    let candidate = out;
    while (jobs.some(j => j.outputPath === candidate) || history.some(h => h.outputPath === candidate)) {
      const insert = `-${n}`;
      candidate = out.replace(/(\.[^.\\/]+)$/, `${insert}$1`);
      n++;
    }
    out = candidate;
  }
  return out;
}

// Convert all
convertAllBtn.addEventListener('click', async () => {
  if (jobs.length === 0) { toast('Nothing to convert', 'Add files first.', 'warn'); return; }
  const ffmpeg = await invoke('check_ffmpeg').catch(() => false);
  if (!ffmpeg) {
    toast('FFmpeg not found', 'Install FFmpeg and ensure it is on PATH. See Settings for details.', 'error', 7000);
    return;
  }

  const pending = jobs.filter(j => j.status === 'Pending' || j.status === 'Failed' || j.status === 'Cancelled');
  for (const job of pending) {
    const kind = job.kind === 'unknown' ? formatKind(formatSelect.value) : job.kind;
    job.kind = kind;
    const fmt = formatSelect.value;
    // refuse mismatched cross-kind conversions (e.g., image -> mp3)
    const targetKind = formatKind(fmt);
    if (targetKind !== kind && !(kind === 'video' && targetKind === 'audio')) {
      job.status = 'Failed';
      job.error = `Cannot convert ${kind} to ${targetKind} (${fmt}). Change the output format.`;
      dlog('error', job.error);
      continue;
    }
    const opt = buildOptions(targetKind);
    const outPath = computeOutputPath(job.inputPath, fmt, targetKind);
    job.outputPath = outPath;
    job.status = 'Queued';
    job.error = null;
    try {
      const serverId = await invoke('add_conversion', {
        inputPath: job.inputPath,
        outputPath: outPath,
        options: opt,
        autoStart: true,
      });
      job.serverId = serverId;
      dlog('event', `Queued conversion: ${job.filename} -> ${basename(outPath)}`);
    } catch (e) {
      job.status = 'Failed';
      job.error = String(e);
      dlog('error', `Failed to queue: ${e}`);
    }
  }
  renderJobs();
});

cancelAllBtn.addEventListener('click', async () => {
  for (const job of jobs) {
    if (job.serverId && (job.status === 'Queued' || job.status === 'Running')) {
      try { await invoke('cancel_conversion', { id: job.serverId }); } catch {}
    }
  }
  dlog('event', 'Cancelled all jobs');
});

clearCompletedBtn.addEventListener('click', async () => {
  for (const job of jobs) {
    if (job.serverId && (job.status === 'Completed' || job.status === 'Failed' || job.status === 'Cancelled')) {
      try { await invoke('remove_conversion', { id: job.serverId }); } catch {}
    }
  }
  jobs = jobs.filter(j => j.status !== 'Completed' && j.status !== 'Failed' && j.status !== 'Cancelled');
  renderJobs();
});

// Render
function renderJobs() {
  if (jobs.length === 0) {
    emptyState.style.display = '';
    Array.from(jobList.children).forEach(c => { if (c !== emptyState) c.remove(); });
    updateFooter();
    return;
  }
  emptyState.style.display = 'none';
  // Build a map of existing nodes
  const existing = {};
  jobList.querySelectorAll('.dl-item').forEach(el => { existing[el.dataset.id] = el; });
  for (const job of jobs) {
    let el = existing[job.id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'dl-item';
      el.dataset.id = job.id;
      jobList.appendChild(el);
    }
    el.innerHTML = renderJobHTML(job);
    delete existing[job.id];
    // bind actions
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(job, btn.dataset.action));
    });
  }
  Object.values(existing).forEach(el => el.remove());
  updateFooter();
}

function renderJobHTML(job) {
  const status = job.status.toLowerCase();
  const statusBadge = `<span class="dl-status ${status}">${job.status}</span>`;
  const progress = Math.max(0, Math.min(100, job.progress || 0)).toFixed(1);
  let speedEta = '';
  if (job.status === 'Running') {
    speedEta = `<span class="dl-speed">${job.speed || ''}</span><span class="dl-eta">${fmtTime(job.eta)}</span>`;
  } else if (job.status === 'Completed') {
    const delta = job.inputSize > 0 ? ((job.outputSize - job.inputSize) / job.inputSize) * 100 : 0;
    const cls = delta <= 0 ? '' : ' bigger';
    speedEta = `<span class="dl-savings${cls}">${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(1)}%</span>`;
  }
  const actions = job.status === 'Running' || job.status === 'Queued'
    ? `<button class="btn-icon" data-action="cancel" title="Cancel">✕</button>`
    : `<button class="btn-icon" data-action="remove" title="Remove">✕</button>`;
  const revealBtn = job.status === 'Completed'
    ? `<button class="btn-icon" data-action="reveal" title="Reveal in folder">📁</button>`
    : '';
  const errorBox = job.error ? `<div class="dl-error">${escapeHtml(job.error)}</div>` : '';
  const outName = job.outputPath ? basename(job.outputPath) : `(${formatSelect.value})`;
  return `
    <div class="dl-row-top">
      <span class="dl-filename" title="${escapeHtml(job.inputPath)}">${escapeHtml(job.filename)}</span>
      <span class="dl-size">${fmtBytes(job.inputSize)}${job.outputSize ? ' → ' + fmtBytes(job.outputSize) : ''}</span>
      ${speedEta}
      ${statusBadge}
      <div class="dl-actions">${revealBtn}${actions}</div>
    </div>
    <div class="dl-progress-wrap"><div class="dl-progress-bar ${status}" style="width:${progress}%"></div></div>
    <div class="dl-row-bottom">
      <span class="dl-url" title="${escapeHtml(job.outputPath || '')}">${escapeHtml(outName)}</span>
      <span class="dl-arrow">${job.kind} → ${formatSelect.value}</span>
    </div>
    ${errorBox}
  `;
}

async function handleAction(job, action) {
  if (action === 'cancel') {
    if (job.serverId) {
      try { await invoke('cancel_conversion', { id: job.serverId }); } catch {}
    }
    job.status = 'Cancelled';
    renderJobs();
  } else if (action === 'remove') {
    if (job.serverId) {
      try { await invoke('remove_conversion', { id: job.serverId }); } catch {}
    }
    jobs = jobs.filter(j => j.id !== job.id);
    renderJobs();
  } else if (action === 'reveal') {
    try { await invoke('reveal_file', { path: job.outputPath }); } catch (e) { dlog('error', 'Reveal failed: ' + e); }
  }
}

function updateFooter() {
  const running = jobs.filter(j => j.status === 'Running').length;
  const queued = jobs.filter(j => j.status === 'Queued').length;
  const completed = jobs.filter(j => j.status === 'Completed').length;
  footerActive.textContent = `${running} running` + (queued > 0 ? ` / ${queued} queued` : '');
  footerCompleted.textContent = `${completed} completed`;
  const totalIn = jobs.reduce((a, j) => a + (j.status === 'Completed' ? j.inputSize : 0), 0);
  const totalOut = jobs.reduce((a, j) => a + (j.status === 'Completed' ? j.outputSize : 0), 0);
  if (totalIn > 0 && totalOut > 0) {
    const saved = totalIn - totalOut;
    footerSaved.textContent = (saved >= 0 ? 'Saved ' : 'Added ') + fmtBytes(Math.abs(saved));
  } else {
    footerSaved.textContent = '';
  }

  const totalActive = running + queued;
  if (totalActive > 0) {
    overallProgress.style.display = '';
    const allActive = jobs.filter(j => j.status === 'Running' || j.status === 'Queued');
    const avg = allActive.reduce((a, j) => a + (j.progress || 0), 0) / Math.max(1, allActive.length);
    overallBar.style.width = avg.toFixed(1) + '%';
    overallPct.textContent = avg.toFixed(0) + '%';
    overallText.textContent = `${running} running, ${queued} queued, ${completed} done`;
  } else {
    overallProgress.style.display = 'none';
  }
}

// Listen for backend progress
listen('conversion-progress', (e) => {
  const j = e.payload;
  if (!j) return;
  const local = jobs.find(x => x.serverId === j.id);
  if (!local) return;
  // backend serializes camelCase per #[serde(rename_all = "camelCase")]
  local.status = j.status;
  local.progress = j.progress;
  local.eta = j.etaSeconds;
  local.speed = j.speed;
  local.outputSize = j.outputSize;
  local.elapsedSeconds = j.elapsedSeconds;
  local.error = j.error || null;
  local.outputPath = j.outputPath;
  local.command = j.command;
  if (local.command && !local.commandLogged) {
    dlog('ffmpeg', `Job ${local.filename}: ${local.command}`);
    local.commandLogged = true;
  }
  if (j.status === 'Completed') {
    dlog('event', `Completed: ${local.filename} → ${basename(j.outputPath)} (${fmtBytes(local.outputSize)})`);
    addToHistory(local);
    if (settings.openFolder && jobs.filter(x => x.status === 'Running').length === 0 && jobs.length === 1) {
      invoke('reveal_file', { path: local.outputPath }).catch(() => {});
    }
    if (settings.autoClear) {
      setTimeout(() => {
        if (local.serverId) invoke('remove_conversion', { id: local.serverId }).catch(() => {});
        jobs = jobs.filter(x => x.id !== local.id);
        renderJobs();
      }, 1500);
    }
  } else if (j.status === 'Failed') {
    dlog('error', `Failed: ${local.filename} - ${local.error || 'unknown error'}`);
    if (local.error) toast('Conversion failed', `${local.filename}: ${local.error.split('\n')[0]}`, 'error', 8000);
    addToHistory(local);
  } else if (j.status === 'Cancelled') {
    dlog('warn', `Cancelled: ${local.filename}`);
    addToHistory(local);
  }
  renderJobs();
});

function addToHistory(job) {
  const entry = {
    id: 'h-' + Math.random().toString(36).slice(2),
    filename: job.filename,
    inputPath: job.inputPath,
    outputPath: job.outputPath,
    kind: job.kind,
    format: job.outputPath ? job.outputPath.split('.').pop() : '',
    status: job.status,
    inputSize: job.inputSize,
    outputSize: job.outputSize,
    duration: job.duration,
    elapsed: job.elapsedSeconds,
    error: job.error,
    date: new Date().toISOString(),
    command: job.command,
  };
  history.unshift(entry);
  if (history.length > 500) history = history.slice(0, 500);
  localStorage.setItem('fr_history', JSON.stringify(history));
  if ($('#panel-history').classList.contains('active')) renderHistory();
}

function renderHistory() {
  const list = $('#historyList');
  const empty = $('#historyEmpty');
  const search = ($('#historySearch').value || '').toLowerCase();
  const sort = $('#historySort').value;
  let items = history.filter(h => historyFilters[h.status] !== false && (!search || h.filename.toLowerCase().includes(search)));
  items.sort((a, b) => {
    if (sort === 'date-desc') return b.date.localeCompare(a.date);
    if (sort === 'date-asc') return a.date.localeCompare(b.date);
    if (sort === 'size-desc') return (b.outputSize||0) - (a.outputSize||0);
    if (sort === 'size-asc') return (a.outputSize||0) - (b.outputSize||0);
    if (sort === 'name-asc') return a.filename.localeCompare(b.filename);
    if (sort === 'name-desc') return b.filename.localeCompare(a.filename);
    return 0;
  });
  $('#historyCount').textContent = `${items.length} entries`;
  if (items.length === 0) {
    empty.style.display = '';
    Array.from(list.children).forEach(c => { if (c !== empty) c.remove(); });
    return;
  }
  empty.style.display = 'none';
  Array.from(list.children).forEach(c => { if (c !== empty) c.remove(); });
  for (const h of items) {
    const el = document.createElement('div');
    el.className = 'history-item';
    const iconCls = h.status.toLowerCase();
    const iconChar = h.status === 'Completed' ? '✓' : h.status === 'Failed' ? '✗' : '—';
    const delta = h.inputSize > 0 && h.outputSize > 0 ? ((h.outputSize - h.inputSize) / h.inputSize) * 100 : 0;
    const deltaCls = delta <= 0 ? 'delta-good' : 'delta-bad';
    const deltaStr = h.outputSize > 0 ? `<span class="${deltaCls}">${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(1)}%</span>` : '';
    el.innerHTML = `
      <div class="history-icon ${iconCls}">${iconChar}</div>
      <div class="history-info">
        <div class="history-filename" title="${escapeHtml(h.inputPath)}">${escapeHtml(h.filename)} → ${escapeHtml(h.format)}</div>
        <div class="history-meta">
          <span>${new Date(h.date).toLocaleString()}</span>
          <span>${fmtBytes(h.inputSize)}${h.outputSize ? ' → ' + fmtBytes(h.outputSize) : ''}</span>
          ${deltaStr}
          ${h.elapsed ? `<span>${fmtTime(h.elapsed)}</span>` : ''}
        </div>
      </div>
      <div class="history-actions">
        ${h.outputPath && h.status === 'Completed' ? `<button class="history-open-folder" data-act="reveal" title="Show in folder">📁</button>` : ''}
        <button class="history-redo" data-act="redo">Redo</button>
      </div>
    `;
    el.querySelector('[data-act="reveal"]')?.addEventListener('click', () => {
      invoke('reveal_file', { path: h.outputPath }).catch(e => dlog('error', e));
    });
    el.querySelector('[data-act="redo"]')?.addEventListener('click', async () => {
      await addFileToQueue(h.inputPath);
      document.querySelector('.nav-item[data-panel="convert"]').click();
    });
    list.appendChild(el);
  }
}

$('#historySearch').addEventListener('input', renderHistory);
$('#historySort').addEventListener('change', renderHistory);
$('#historyClearBtn').addEventListener('click', () => {
  if (history.length === 0) return;
  history = [];
  localStorage.setItem('fr_history', JSON.stringify(history));
  renderHistory();
});
document.querySelectorAll('.history-filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    const s = b.dataset.status;
    historyFilters[s] = !historyFilters[s];
    b.classList.toggle('active', historyFilters[s]);
    renderHistory();
  });
});

// Debug filters
document.querySelectorAll('.debug-filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    const l = b.dataset.level;
    debugFilters[l] = !debugFilters[l];
    b.classList.toggle('active', debugFilters[l]);
    renderDebug();
  });
});
$('#debugSearch').addEventListener('input', renderDebug);
$('#debugClearBtn').addEventListener('click', () => { debugLogs = []; renderDebug(); });
$('#debugExportBtn').addEventListener('click', () => {
  $('#debugExportMenu').classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.export-wrap')) $('#debugExportMenu').classList.remove('open');
});
$('#debugExportMenu').addEventListener('click', (e) => {
  const fmt = e.target.dataset.format;
  if (!fmt) return;
  let text;
  if (fmt === 'csv') {
    text = 'timestamp,level,message\n' + debugLogs.map(l => `"${l.ts}","${l.level}","${l.msg.replace(/"/g,'""')}"`).join('\n');
  } else {
    text = debugLogs.map(l => `[${l.ts}] ${l.level.toUpperCase()} ${l.msg}`).join('\n');
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `format-reaper-logs.${fmt === 'csv' ? 'csv' : 'txt'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#debugExportMenu').classList.remove('open');
});

// Settings UI
$('#defaultOutputDir').value = settings.outputDir;
$('#defaultOutputDir').addEventListener('change', () => {
  settings.outputDir = $('#defaultOutputDir').value;
  localStorage.setItem('fr_outputDir', settings.outputDir);
  outputDirInput.value = settings.outputDir;
});
$('#browseDefaultBtn').addEventListener('click', async () => {
  try {
    const folder = await dialog.open({ directory: true });
    if (typeof folder === 'string') {
      settings.outputDir = folder;
      localStorage.setItem('fr_outputDir', folder);
      $('#defaultOutputDir').value = folder;
      outputDirInput.value = folder;
    }
  } catch (e) { dlog('error', e); }
});
$('#namingMode').value = settings.namingMode;
$('#namingMode').addEventListener('change', () => {
  settings.namingMode = $('#namingMode').value;
  localStorage.setItem('fr_namingMode', settings.namingMode);
});
$('#maxConcurrent').value = String(settings.maxConcurrent);
$('#maxConcurrent').addEventListener('change', () => {
  settings.maxConcurrent = Math.max(1, Math.min(8, parseInt($('#maxConcurrent').value || '1', 10)));
  localStorage.setItem('fr_maxConcurrent', String(settings.maxConcurrent));
});
$('#defaultHwAccel').value = settings.defaultHwAccel;
$('#defaultHwAccel').addEventListener('change', () => {
  settings.defaultHwAccel = $('#defaultHwAccel').value;
  localStorage.setItem('fr_defaultHwAccel', settings.defaultHwAccel);
});

// Init
async function init() {
  try {
    defaultOutputDir = await invoke('get_default_output_dir');
    if (!settings.outputDir) {
      settings.outputDir = defaultOutputDir;
      localStorage.setItem('fr_outputDir', defaultOutputDir);
    }
    outputDirInput.value = settings.outputDir;
    $('#defaultOutputDir').value = settings.outputDir;
  } catch (e) {
    dlog('warn', 'Could not get default output dir: ' + e);
  }

  try {
    const has = await invoke('check_ffmpeg');
    if (has) {
      ffmpegStatus.textContent = 'FFmpeg detected';
      ffmpegStatus.className = 'ffmpeg-status ok';
      $('#ffmpegInfo').textContent = 'FFmpeg detected on PATH.';
      dlog('info', 'FFmpeg detected on PATH');
    } else {
      ffmpegStatus.textContent = 'FFmpeg not found - install from ffmpeg.org';
      ffmpegStatus.className = 'ffmpeg-status missing';
      $('#ffmpegInfo').textContent = 'Not found. Install from https://ffmpeg.org/ and make sure ffmpeg + ffprobe are on PATH.';
      $('#ffmpegInfo').style.color = 'var(--danger)';
      dlog('error', 'FFmpeg not found on PATH');
    }
  } catch (e) {
    dlog('error', 'FFmpeg check failed: ' + e);
  }

  try {
    availableHwAccels = await invoke('check_hwaccel');
    const hwEl = $('#hwDetected');
    if (availableHwAccels.length > 0) {
      hwEl.textContent = 'Available: ' + availableHwAccels.join(', ').toUpperCase();
      hwEl.style.color = 'var(--success)';
      dlog('info', 'Hardware encoders: ' + availableHwAccels.join(', '));
    } else {
      hwEl.textContent = 'No hardware encoders found (CPU only).';
      hwEl.style.color = 'var(--text-dim)';
    }
  } catch (e) {
    dlog('warn', 'Hardware accel check failed: ' + e);
  }

  // Apply saved preset
  const pill = document.querySelector(`.preset-pill[data-preset="${settings.preset}"]`);
  if (pill) {
    document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    applyPreset(settings.preset);
  } else {
    applyPreset('iphone');
  }

  refreshToggles();
  onFormChange();
  setupDragDrop();
}

init();
