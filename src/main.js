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
  deinterlace: false,
  noAudio: false,
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
const targetSizeMbInput = $('#targetSizeMb');
const verticalModeSelect = $('#verticalMode');

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

// Parse "HH:MM:SS(.ms)" or "MM:SS" or "SS" or "SS.sss" into seconds.
// Returns NaN if invalid (caller can check with isFinite).
function parseTimeToSeconds(str) {
  if (!str) return NaN;
  const s = String(str).trim();
  if (!s) return NaN;
  const parts = s.split(':');
  let total = 0;
  for (const p of parts) {
    const n = parseFloat(p);
    if (!isFinite(n)) return NaN;
    total = total * 60 + n;
  }
  return total;
}

function computeTrimmedDuration(fullDuration, trimStart, trimEnd) {
  if (!fullDuration || fullDuration <= 0) return 0;
  let start = parseTimeToSeconds(trimStart);
  let end = parseTimeToSeconds(trimEnd);
  if (!isFinite(start) || start < 0) start = 0;
  if (!isFinite(end) || end <= 0 || end > fullDuration) end = fullDuration;
  return Math.max(0, end - start);
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
function toast(title, msg, type = 'info', timeout = 4000, action = null) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'error' ? 'error' : type === 'warn' ? 'warn' : type === 'success' ? 'success' : '');
  const icon = type === 'error' ? '⚠' : type === 'warn' ? '⚠' : type === 'success' ? '✓' : 'i';
  const actionHtml = action ? `<button class="toast-action">${escapeHtml(action.label)}</button>` : '';
  el.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-msg">${escapeHtml(msg)}</div>
    </div>
    ${actionHtml}
    <button class="toast-close">✕</button>
  `;
  el.querySelector('.toast-close').addEventListener('click', () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 220);
  });
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      try { action.onClick(); } catch (e) { dlog('error', 'Toast action failed: ' + e); }
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 220);
    });
  }
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
bindToggle('deinterlaceToggleWrap', 'deinterlaceCheck', 'deinterlace');
bindToggle('noAudioToggleWrap', 'noAudioCheck', 'noAudio');

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

// Presets
const BUILTIN_PRESETS = {
  'iPhone 4K HEVC':       { format: 'mp4',  videoCodec: 'libx265', crf: 20, vbitrate: 0, preset: 'medium', resolution: 'keep',  fps: 0,  audioCodec: 'aac',     abitrate: 192, iphone: true,  lossless: false, hw: true,  deinterlace: false },
  'iPhone 1080p':         { format: 'mp4',  videoCodec: 'libx265', crf: 22, vbitrate: 0, preset: 'medium', resolution: '1080p', fps: 0,  audioCodec: 'aac',     abitrate: 192, iphone: true,  lossless: false, hw: true,  deinterlace: false },
  'Instagram (iPhone)':   { format: 'mp4',  videoCodec: 'libx264', crf: 21, vbitrate: 0, preset: 'medium', resolution: '1080p', fps: 30, audioCodec: 'aac',     abitrate: 128, iphone: true,  lossless: false, hw: true,  deinterlace: true  },
  'MP4 H.264':            { format: 'mp4',  videoCodec: 'libx264', crf: 20, vbitrate: 0, preset: 'medium', resolution: 'keep',  fps: 0,  audioCodec: 'aac',     abitrate: 192, iphone: false, lossless: false, hw: true,  deinterlace: false },
  'WebM VP9':             { format: 'webm', videoCodec: 'libvpx-vp9', crf: 30, vbitrate: 0, preset: 'medium', resolution: 'keep', fps: 0, audioCodec: 'libopus', abitrate: 128, iphone: false, lossless: false, hw: false, deinterlace: false },
  'Audio MP3 320k':       { format: 'mp3',  audioOnlyCodec: 'libmp3lame', audioOnlyBitrate: 320 },
  'Lossless MKV':         { format: 'mkv',  videoCodec: 'libx265', preset: 'medium', resolution: 'keep', fps: 0, audioCodec: 'copy', iphone: false, lossless: true, hw: false, deinterlace: false },
  'Camcorder MTS clean':  { format: 'mp4',  videoCodec: 'libx265', crf: 20, vbitrate: 0, preset: 'medium', resolution: 'keep',  fps: 0,  audioCodec: 'aac',     abitrate: 256, iphone: true,  lossless: false, hw: true,  deinterlace: true  },
  'Custom (no preset)':   { __noop: true },
};

const PRESETS_KEY = 'fr_custom_presets_v1';

function loadCustomPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}'); }
  catch { return {}; }
}
function saveCustomPresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function snapshotForm() {
  return {
    format: formatSelect.value,
    videoCodec: videoCodec.value,
    audioCodec: audioCodec.value,
    crf: parseInt(crfInput.value, 10) || 0,
    vbitrate: parseInt(vbitrateInput.value, 10) || 0,
    abitrate: parseInt(abitrateInput.value, 10) || 0,
    preset: presetSelect.value,
    resolution: resolutionSelect.value,
    fps: parseFloat(fpsSelect.value) || 0,
    imageQuality: parseInt(imageQualityInput.value, 10) || 0,
    imageResolution: imageResolutionSelect.value,
    audioOnlyCodec: audioOnlyCodec.value,
    audioOnlyBitrate: parseInt(audioOnlyBitrate.value, 10) || 0,
    iphone: !!formState.iphone,
    lossless: !!formState.lossless,
    metadata: !!formState.metadata,
    hw: !!formState.hw,
    deinterlace: !!formState.deinterlace,
    noAudio: !!formState.noAudio,
    targetSizeMb: parseInt(targetSizeMbInput.value, 10) || 0,
    verticalMode: verticalModeSelect.value || 'off',
  };
}

function applyPresetData(data) {
  if (!data || data.__noop) {
    refreshToggles();
    onFormChange();
    return;
  }
  if (data.format != null) formatSelect.value = data.format;
  if (data.videoCodec != null) videoCodec.value = data.videoCodec;
  if (data.audioCodec != null) audioCodec.value = data.audioCodec;
  if (data.crf != null) crfInput.value = String(data.crf);
  if (data.vbitrate != null) vbitrateInput.value = String(data.vbitrate);
  if (data.abitrate != null) abitrateInput.value = String(data.abitrate);
  if (data.preset != null) presetSelect.value = data.preset;
  if (data.resolution != null) resolutionSelect.value = data.resolution;
  if (data.fps != null) fpsSelect.value = String(data.fps);
  if (data.imageQuality != null) imageQualityInput.value = String(data.imageQuality);
  if (data.imageResolution != null) imageResolutionSelect.value = data.imageResolution;
  if (data.audioOnlyCodec != null) audioOnlyCodec.value = data.audioOnlyCodec;
  if (data.audioOnlyBitrate != null) audioOnlyBitrate.value = String(data.audioOnlyBitrate);
  if (data.iphone != null) formState.iphone = !!data.iphone;
  if (data.lossless != null) formState.lossless = !!data.lossless;
  if (data.metadata != null) formState.metadata = !!data.metadata;
  if (data.hw != null) formState.hw = !!data.hw;
  if (data.deinterlace != null) formState.deinterlace = !!data.deinterlace;
  if (data.noAudio != null) formState.noAudio = !!data.noAudio;
  if (data.targetSizeMb != null) targetSizeMbInput.value = String(data.targetSizeMb);
  if (data.verticalMode != null) verticalModeSelect.value = data.verticalMode;
  refreshToggles();
  onFormChange();
}

function rebuildPresetDropdown(selectedName) {
  const dd = $('#presetDropdown');
  const custom = loadCustomPresets();
  const builtinNames = Object.keys(BUILTIN_PRESETS).sort((a, b) => a.localeCompare(b));
  const customNames = Object.keys(custom).sort((a, b) => a.localeCompare(b));

  dd.innerHTML = '';
  const groupBuiltin = document.createElement('optgroup');
  groupBuiltin.label = 'Built-in';
  for (const name of builtinNames) {
    const opt = document.createElement('option');
    opt.value = 'builtin:' + name;
    opt.textContent = name;
    groupBuiltin.appendChild(opt);
  }
  dd.appendChild(groupBuiltin);

  if (customNames.length > 0) {
    const groupCustom = document.createElement('optgroup');
    groupCustom.label = 'My presets';
    for (const name of customNames) {
      const opt = document.createElement('option');
      opt.value = 'custom:' + name;
      opt.textContent = name;
      groupCustom.appendChild(opt);
    }
    dd.appendChild(groupCustom);
  }

  if (selectedName) dd.value = selectedName;
}

function applyPresetByKey(key) {
  if (!key) return;
  dlog('event', `Applied preset: ${key}`);
  if (key.startsWith('builtin:')) {
    const name = key.slice('builtin:'.length);
    applyPresetData(BUILTIN_PRESETS[name]);
  } else if (key.startsWith('custom:')) {
    const name = key.slice('custom:'.length);
    const presets = loadCustomPresets();
    applyPresetData(presets[name]);
  }
  updateDeleteBtn();
}

function updateDeleteBtn() {
  const v = $('#presetDropdown').value || '';
  $('#deletePresetBtn').style.display = v.startsWith('custom:') ? '' : 'none';
}

$('#presetDropdown').addEventListener('change', () => {
  const v = $('#presetDropdown').value;
  settings.preset = v;
  localStorage.setItem('fr_preset', v);
  applyPresetByKey(v);
});

// Save preset dialog
const savePresetDialog = $('#savePresetDialog');
const presetNameInput = $('#presetNameInput');
$('#savePresetBtn').addEventListener('click', () => {
  presetNameInput.value = '';
  savePresetDialog.style.display = '';
  setTimeout(() => presetNameInput.focus(), 50);
});
$('#presetSaveCancelBtn').addEventListener('click', () => { savePresetDialog.style.display = 'none'; });
savePresetDialog.addEventListener('click', (e) => {
  if (e.target === savePresetDialog) savePresetDialog.style.display = 'none';
});
$('#presetSaveConfirmBtn').addEventListener('click', () => {
  const name = (presetNameInput.value || '').trim();
  if (!name) { toast('Name required', 'Give the preset a name.', 'warn'); return; }
  if (BUILTIN_PRESETS[name]) { toast('Reserved name', 'That name is taken by a built-in preset.', 'warn'); return; }
  const presets = loadCustomPresets();
  const existed = !!presets[name];
  presets[name] = snapshotForm();
  saveCustomPresets(presets);
  rebuildPresetDropdown('custom:' + name);
  settings.preset = 'custom:' + name;
  localStorage.setItem('fr_preset', settings.preset);
  updateDeleteBtn();
  savePresetDialog.style.display = 'none';
  toast(existed ? 'Preset updated' : 'Preset saved', name, 'success', 2500);
  dlog('event', `Saved preset: ${name}`);
});
presetNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#presetSaveConfirmBtn').click();
  if (e.key === 'Escape') $('#presetSaveCancelBtn').click();
});

$('#deletePresetBtn').addEventListener('click', () => {
  const v = $('#presetDropdown').value;
  if (!v.startsWith('custom:')) return;
  const name = v.slice('custom:'.length);
  const presets = loadCustomPresets();
  delete presets[name];
  saveCustomPresets(presets);
  rebuildPresetDropdown('builtin:iPhone 4K HEVC');
  settings.preset = 'builtin:iPhone 4K HEVC';
  localStorage.setItem('fr_preset', settings.preset);
  applyPresetByKey(settings.preset);
  toast('Preset deleted', name, 'info', 2500);
  dlog('event', `Deleted preset: ${name}`);
});

function refreshToggles() {
  $('#losslessCheck').classList.toggle('on', formState.lossless);
  $('#iphoneCheck').classList.toggle('on', formState.iphone);
  $('#metadataCheck').classList.toggle('on', formState.metadata);
  $('#hwCheck').classList.toggle('on', formState.hw);
  $('#deinterlaceCheck').classList.toggle('on', formState.deinterlace);
  $('#noAudioCheck').classList.toggle('on', formState.noAudio);
  applyAudioDisabledState();
}

function applyAudioDisabledState() {
  const off = !!formState.noAudio;
  const fmt = formatSelect.value;
  const kind = formatKind(fmt);
  // Video-row audio fields
  const aCodecGroup = audioCodec.closest('.form-group');
  const aBitrateGroup = abitrateInput.closest('.form-group');
  if (aCodecGroup) aCodecGroup.classList.toggle('disabled', off && kind === 'video');
  if (aBitrateGroup) aBitrateGroup.classList.toggle('disabled', off && kind === 'video');
  // Audio-only fields
  const aoCodecGroup = audioOnlyCodec.closest('.form-group');
  const aoBitrateGroup = audioOnlyBitrate.closest('.form-group');
  if (aoCodecGroup) aoCodecGroup.classList.toggle('disabled', off && kind === 'audio');
  if (aoBitrateGroup) aoBitrateGroup.classList.toggle('disabled', off && kind === 'audio');
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
  applyAudioDisabledState();
}
formatSelect.addEventListener('change', () => { onFormChange(); });
videoCodec.addEventListener('change', onFormChange);
targetSizeMbInput.addEventListener('change', () => {
  const v = parseInt(targetSizeMbInput.value, 10) || 0;
  localStorage.setItem('fr_targetSizeMb', String(v));
});
verticalModeSelect.addEventListener('change', () => {
  localStorage.setItem('fr_verticalMode', verticalModeSelect.value);
});
// Restore last-used values
targetSizeMbInput.value = String(parseInt(localStorage.getItem('fr_targetSizeMb') || '0', 10));
verticalModeSelect.value = localStorage.getItem('fr_verticalMode') || 'off';

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

function buildOptions(kind, job) {
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
    deinterlace: !!formState.deinterlace,
    noAudio: !!formState.noAudio,
    trimStart: job && job.trimStart ? job.trimStart : null,
    trimEnd: job && job.trimEnd ? job.trimEnd : null,
    verticalMode: verticalModeSelect.value || 'off',
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

    // Fit-to-size: compute bitrate to hit target (5% safety margin).
    // Overrides CRF / Bitrate. Requires a duration to be useful.
    const targetMB = parseInt(targetSizeMbInput.value, 10) || 0;
    if (targetMB > 0 && job && job.duration > 0) {
      const effectiveDur = Math.max(
        1,
        computeTrimmedDuration(job.duration, job.trimStart, job.trimEnd)
      );
      const audioKbps = opt.noAudio ? 0 : (opt.audioBitrateKbps || 192);
      const totalKbpsBudget = (targetMB * 8 * 1024 * 0.95) / effectiveDur;
      const videoKbps = Math.max(50, Math.floor(totalKbpsBudget - audioKbps));
      opt.videoBitrateKbps = videoKbps;
      opt.crf = null;
      dlog('info', `Fit-to-size ${targetMB}MB over ${effectiveDur.toFixed(1)}s -> video ${videoKbps} kbps + audio ${audioKbps} kbps`);
    }
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
    toast(
      'FFmpeg not found',
      'Install FFmpeg and ensure ffmpeg + ffprobe are on PATH.',
      'error',
      9000,
      { label: 'Install FFmpeg', onClick: () => openInstallDialog() }
    );
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
    const opt = buildOptions(targetKind, job);
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
      const action = btn.dataset.action;
      if (action === 'trim-start' || action === 'trim-end') {
        btn.addEventListener('input', () => handleAction(job, action, btn.value));
      } else {
        btn.addEventListener('click', () => handleAction(job, action));
      }
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

  // Trim editor: only for video/audio jobs that have not started yet
  const trimmable = (job.kind === 'video' || job.kind === 'audio')
    && (job.status === 'Pending' || job.status === 'Failed' || job.status === 'Cancelled');
  let trimBlock = '';
  if (trimmable) {
    const trimOn = !!(job.trimStart || job.trimEnd);
    const expanded = !!job.trimExpanded;
    const totalLabel = job.duration > 0 ? ` of ${fmtTime(job.duration)}` : '';
    const editor = expanded
      ? `<div class="dl-trim-row">
           <label>Start</label>
           <input data-action="trim-start" type="text" placeholder="00:00:05 or 5" value="${escapeHtml(job.trimStart || '')}" />
           <label>End</label>
           <input data-action="trim-end" type="text" placeholder="00:00:15 or 15" value="${escapeHtml(job.trimEnd || '')}" />
           <span class="dl-trim-hint">${totalLabel}</span>
           <button class="btn-icon" data-action="trim-clear" title="Clear trim">✕</button>
         </div>`
      : '';
    trimBlock = `<button class="dl-trim-toggle ${trimOn ? 'on' : ''}" data-action="trim-toggle">${trimOn ? `Trim ${escapeHtml(job.trimStart || '0')} - ${escapeHtml(job.trimEnd || 'end')}` : '+ Trim'}</button>${editor}`;
  }

  return `
    <div class="dl-row-top">
      <span class="dl-filename" title="${escapeHtml(job.inputPath)}">${escapeHtml(job.filename)}</span>
      <span class="dl-size">${fmtBytes(job.inputSize)}${job.outputSize ? ' → ' + fmtBytes(job.outputSize) : ''}</span>
      ${speedEta}
      ${statusBadge}
      <div class="dl-actions">${trimBlock}${revealBtn}${actions}</div>
    </div>
    <div class="dl-progress-wrap"><div class="dl-progress-bar ${status}" style="width:${progress}%"></div></div>
    <div class="dl-row-bottom">
      <span class="dl-url" title="${escapeHtml(job.outputPath || '')}">${escapeHtml(outName)}</span>
      <span class="dl-arrow">${job.kind} → ${formatSelect.value}</span>
    </div>
    ${errorBox}
  `;
}

async function handleAction(job, action, value) {
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
  } else if (action === 'trim-toggle') {
    job.trimExpanded = !job.trimExpanded;
    renderJobs();
  } else if (action === 'trim-start') {
    job.trimStart = (value || '').trim();
  } else if (action === 'trim-end') {
    job.trimEnd = (value || '').trim();
  } else if (action === 'trim-clear') {
    job.trimStart = '';
    job.trimEnd = '';
    job.trimExpanded = false;
    renderJobs();
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
    {
      const inSz = local.inputSize || 0;
      const outSz = local.outputSize || 0;
      let delta = '';
      if (inSz > 0 && outSz > 0) {
        const pct = ((outSz - inSz) / inSz) * 100;
        delta = ` [${pct <= 0 ? '-' : '+'}${Math.abs(pct).toFixed(1)}%]`;
      }
      dlog('event', `Completed: ${local.filename} (${fmtBytes(inSz)}) -> ${basename(j.outputPath)} (${fmtBytes(outSz)})${delta}`);
      if (inSz > 0 && outSz > inSz * 1.5) {
        dlog('warn', `Output is ${(outSz/inSz).toFixed(1)}x the source - check if Lossless or a very low CRF is enabled.`);
      }
    }
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
$('#debugCopyAllBtn').addEventListener('click', async () => {
  const search = ($('#debugSearch').value || '').toLowerCase();
  const filtered = debugLogs.filter(e => debugFilters[e.level] && (!search || e.msg.toLowerCase().includes(search)));
  if (filtered.length === 0) { toast('Nothing to copy', 'No log entries match the current filters.', 'warn', 2500); return; }
  const text = filtered.map(l => `[${l.ts}] ${l.level.toUpperCase()} ${l.msg}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    const btn = $('#debugCopyAllBtn');
    const orig = btn.textContent;
    btn.textContent = `Copied ${filtered.length}`;
    setTimeout(() => { btn.textContent = orig; }, 1400);
  } catch (e) {
    dlog('warn', 'Clipboard write failed: ' + e);
    toast('Copy failed', String(e), 'warn');
  }
});
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

// FFmpeg detection + refresh
const FFMPEG_DOWNLOAD_URL = 'https://ffmpeg.org/download.html';

function makeFfmpegLink(label) {
  const a = document.createElement('a');
  a.href = '#';
  a.textContent = label;
  a.addEventListener('click', (e) => { e.preventDefault(); openInstallDialog(); });
  return a;
}

async function checkFfmpegEnv(silent = false) {
  const refreshBtn = $('#ffmpegRefreshBtn');
  if (refreshBtn) refreshBtn.classList.add('spinning');
  let has = false;
  try {
    has = await invoke('check_ffmpeg');
  } catch (e) {
    dlog('error', 'FFmpeg check failed: ' + e);
  }

  ffmpegStatus.innerHTML = '';
  const info = $('#ffmpegInfo');
  info.innerHTML = '';
  info.style.color = '';

  if (has) {
    ffmpegStatus.className = 'ffmpeg-status ok';
    ffmpegStatus.appendChild(document.createTextNode('FFmpeg detected'));
    info.appendChild(document.createTextNode('FFmpeg detected on PATH.'));
    dlog('info', 'FFmpeg detected on PATH');
    if (!silent) toast('FFmpeg detected', 'ffmpeg and ffprobe are reachable.', 'success', 3000);
  } else {
    ffmpegStatus.className = 'ffmpeg-status missing';
    ffmpegStatus.appendChild(document.createTextNode('FFmpeg not found - '));
    ffmpegStatus.appendChild(makeFfmpegLink('install'));
    info.style.color = 'var(--danger)';
    info.appendChild(document.createTextNode('Not found. Install FFmpeg ('));
    info.appendChild(makeFfmpegLink('ffmpeg.org/download'));
    info.appendChild(document.createTextNode(') and make sure ffmpeg + ffprobe are on PATH, then click Re-check.'));
    dlog('error', 'FFmpeg not found on PATH');
    if (!silent) {
      toast(
        'FFmpeg still not found',
        'Re-checked PATH and could not see ffmpeg or ffprobe.',
        'error',
        7000,
        { label: 'Install FFmpeg', onClick: () => openInstallDialog() }
      );
    }
  }

  try {
    availableHwAccels = await invoke('check_hwaccel');
    const hwEl = $('#hwDetected');
    if (availableHwAccels.length > 0) {
      hwEl.textContent = 'Available: ' + availableHwAccels.join(', ').toUpperCase();
      hwEl.style.color = 'var(--success)';
      dlog('info', 'Hardware encoders: ' + availableHwAccels.join(', '));
    } else {
      hwEl.textContent = has ? 'No hardware encoders found (CPU only).' : 'Cannot detect hardware encoders without FFmpeg.';
      hwEl.style.color = 'var(--text-dim)';
    }
  } catch (e) {
    dlog('warn', 'Hardware accel check failed: ' + e);
  }

  if (refreshBtn) setTimeout(() => refreshBtn.classList.remove('spinning'), 400);
  return has;
}

$('#ffmpegRefreshBtn').addEventListener('click', () => checkFfmpegEnv(false));
$('#ffmpegRecheckBtn').addEventListener('click', () => checkFfmpegEnv(false));
$('#ffmpegDownloadBtn').addEventListener('click', () => openInstallDialog());

// FFmpeg install dialog
function detectOS() {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os x') || ua.includes('macintosh')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'windows';
}

function openInstallDialog() {
  const dlg = $('#ffmpegInstallDialog');
  if (!dlg) return;
  dlg.style.display = '';
  switchInstallTab(detectOS());
}

function closeInstallDialog() {
  const dlg = $('#ffmpegInstallDialog');
  if (dlg) dlg.style.display = 'none';
}

function switchInstallTab(os) {
  document.querySelectorAll('.install-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.os === os);
  });
  document.querySelectorAll('.install-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.os === os);
  });
}

document.querySelectorAll('.install-tab').forEach(t => {
  t.addEventListener('click', () => switchInstallTab(t.dataset.os));
});

$('#installDialogClose').addEventListener('click', closeInstallDialog);
$('#installDoneBtn').addEventListener('click', closeInstallDialog);
$('#installRecheckBtn').addEventListener('click', async () => {
  const has = await checkFfmpegEnv(false);
  if (has) closeInstallDialog();
});
$('#ffmpegInstallDialog').addEventListener('click', (e) => {
  if (e.target.id === 'ffmpegInstallDialog') closeInstallDialog();
});
$('#ffmpegSiteLink').addEventListener('click', (e) => { e.preventDefault(); openUrl(FFMPEG_DOWNLOAD_URL); });

document.querySelectorAll('.ext-link').forEach(a => {
  a.addEventListener('click', (e) => {
    if (!a.dataset.url) return;
    e.preventDefault();
    openUrl(a.dataset.url);
  });
});

document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const text = target.textContent;
    try {
      await navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1400);
    } catch (e) {
      dlog('warn', 'Clipboard write failed: ' + e);
      toast('Copy failed', String(e), 'warn');
    }
  });
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

  await checkFfmpegEnv(true);

  // Migrate legacy preset id (old "iphone", "iphone-1080", etc.) to new key format
  const legacyMap = {
    'iphone': 'builtin:iPhone 4K HEVC',
    'iphone-1080': 'builtin:iPhone 1080p',
    'mp4-h264': 'builtin:MP4 H.264',
    'webm': 'builtin:WebM VP9',
    'audio-mp3': 'builtin:Audio MP3 320k',
    'lossless': 'builtin:Lossless MKV',
    'custom': 'builtin:Custom (no preset)',
  };
  if (legacyMap[settings.preset]) {
    settings.preset = legacyMap[settings.preset];
    localStorage.setItem('fr_preset', settings.preset);
  }

  rebuildPresetDropdown(settings.preset);
  // If saved preset doesn't exist any more, fall back to iPhone 4K HEVC
  const dd = $('#presetDropdown');
  if (dd.value !== settings.preset) {
    settings.preset = 'builtin:iPhone 4K HEVC';
    localStorage.setItem('fr_preset', settings.preset);
    dd.value = settings.preset;
  }
  applyPresetByKey(settings.preset);

  refreshToggles();
  onFormChange();
  setupDragDrop();
}

init();
