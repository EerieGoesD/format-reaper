const { invoke } = window.__TAURI__.core;
const { listen, getCurrent: getCurrentWebview } = window.__TAURI__.event;
const dialog = window.__TAURI__.dialog;
const webviewWindow = window.__TAURI__.webviewWindow;
const tauriEvent = window.__TAURI__.event;

// ── i18n ──
const I18N = {
  en: {
    'nav.convert': 'Convert', 'nav.history': 'History', 'nav.settings': 'Settings', 'nav.debug': 'Debug',
    'btn.addFiles': 'Add Files', 'btn.addFolder': 'Add Folder',
    'btn.convertAll': 'Convert All', 'btn.cancelAll': 'Cancel All', 'btn.clearCompleted': 'Clear Completed',
    'btn.reset': 'Reset', 'btn.browse': 'Browse', 'btn.recheck': 'Re-check', 'btn.download': 'Download',
    'btn.save': 'Save', 'btn.cancel': 'Cancel', 'btn.close': 'Close',
    'btn.play': '▶ Play', 'btn.pause': '⏸ Pause', 'btn.playRange': 'Play IN to OUT',
    'btn.previewInPlayer': '▶ Preview in player',
    'btn.saveAs': '+ Save as...', 'btn.delete': 'Delete',
    'btn.addFolderWatch': '+ Add folder', 'btn.copyAll': 'Copy All', 'btn.export': 'Export', 'btn.clear': 'Clear',
    'btn.retry': 'Retry', 'btn.remove': 'Remove', 'btn.trim': '+ Trim',
    'hint.dropFiles': 'or drop files anywhere in the window',
    'label.preset': 'Preset:', 'label.outputFormat': 'Output Format', 'label.outputFolder': 'Output Folder',
    'label.videoCodec': 'Video Codec', 'label.quality': 'Quality (CRF)', 'label.bitrate': 'Bitrate (kbps)',
    'label.fitToSize': 'Fit to size (MB)', 'label.encPreset': 'Preset', 'label.resolution': 'Resolution',
    'label.vertical': 'Vertical 9:16', 'label.fps': 'Frame Rate',
    'label.audioCodec': 'Audio Codec', 'label.audioBitrate': 'Audio Bitrate (kbps)',
    'label.imageQuality': 'Image Quality',
    'toggle.lossless': 'Lossless', 'toggle.iphone': 'iPhone / iPad compatible',
    'toggle.stripMetadata': 'Strip metadata', 'toggle.hw': 'Hardware acceleration',
    'toggle.deinterlace': 'Deinterlace', 'toggle.noAudio': 'No audio',
    'footer.madeBy': 'Made by', 'footer.support': 'Support This Project',
    'footer.report': 'Report Issue', 'footer.suggest': 'Suggest Feature',
    'footer.running': '{n} running', 'footer.queued': '{n} queued', 'footer.completed': '{n} completed',
    'footer.saved': 'Saved {size}', 'footer.added': 'Added {size}',
    'trim.in': 'IN', 'trim.out': 'OUT', 'trim.length': 'Trimmed length',
    'trim.sourceDuration': 'Source duration:', 'trim.dragHint': 'Drag the green handle for IN, the red handle for OUT.',
    'trim.generating': 'Generating preview...', 'trim.ready': 'Ready', 'trim.unavail': 'Inline preview unavailable',
    'drop.title': 'Drop files to convert', 'drop.sub': 'Video, audio and image files supported',
    'status.ffmpegOk': 'FFmpeg detected', 'status.ffmpegMissingPrefix': 'FFmpeg not found - ', 'install.link': 'install',
    'status.running': 'Running', 'status.queued': 'Queued', 'status.completed': 'Completed',
    'status.failed': 'Failed', 'status.cancelled': 'Cancelled', 'status.pending': 'Pending',
    'tip.crf': 'CRF = Constant Rate Factor. FFmpeg picks the bitrate automatically to keep this perceived quality steady throughout the video.\n\nWhat number should I use?\n\n0  - lossless (huge file)\n16 - archive quality\n18 - visually identical to source\n20 - excellent\n23 - good (FFmpeg default)\n28 - acceptable, small file\n51 - worst\n\nLower number = better quality + larger file. Each +6 roughly doubles the file size.\n\nOnly applies to libx264 / libx265. Ignored when "Fit to size" or "Bitrate" is set.',
    'tip.bitrate': 'Target video bitrate in kilobits per second. 0 = use CRF (recommended). Higher = better quality, larger file.',
    'tip.fitToSize': 'Target final file size in megabytes. Format Reaper computes the bitrate needed to hit this size (with a 5% safety margin) and overrides CRF/Bitrate. 0 = disabled. Common targets: 8 (free Discord), 25 (Nitro Basic), 50 (Nitro), 100 (Reddit), 4096 (Instagram Reels cap).',
    'tip.vertical': 'Reels / TikTok / Shorts output.\nOff: keep original aspect.\nCenter crop: crops the sides off (loses content).\nBlurred fit: scales to fit + blurred zoomed background fills the bars (Premiere style, keeps everything visible).\nOutput always 1080x1920.',
    'tip.imageQuality': 'Quality level for lossy image formats. 100 = near-lossless, 1 = lowest. 85-95 is the sweet spot for JPG/WebP.',
    'tip.lossless': 'Convert without any quality loss. For video this disables bitrate/CRF and uses true lossless encoding (much larger files). For images, only formats that support lossless (PNG, WebP, AVIF, TIFF) will be perfect.',
    'tip.iphone': 'Enforces playable settings on Apple devices: yuv420p pixel format, hvc1 tag for HEVC, and faststart flag so the file streams from anywhere in the timeline. Recommended for AirDrop / Photos.',
    'tip.stripMetadata': 'Remove EXIF, GPS, camera info, encoding tags. Useful before sharing online.',
    'tip.hw': 'Use GPU encoding when available (NVENC / QSV / VideoToolbox / VAAPI / AMF). Much faster, slightly larger files at the same quality.',
    'tip.deinterlace': 'Removes the combing artifacts you get from interlaced sources. Enable for MTS / M2TS / MPEG-TS camcorder footage and old DVDs. Adds the yadif filter.',
    'tip.noAudio': 'Strip the audio stream from the output. Useful when you want a silent clip or are going to add your own audio later. Disables all audio settings.',
    'tip.maxConcurrent': 'How many files convert in parallel. Higher = faster batch, but each one is slower. For hardware-accelerated encoding 1-2 is usually best. CPU encoding can handle more.',
    'tip.watchFolders': 'Format Reaper watches each folder while the app is open. Any new media file dropped or downloaded into the folder is auto-queued with the selected preset, and starts converting as soon as its file size stops growing. Output goes to your default output folder.',
    'tip.debug': 'Adds a Debug panel to the sidebar with real-time logs of every FFmpeg invocation, file probe, and conversion event. The full command used for each job is logged so you can rerun it manually.',
    'tip.encPreset': 'FFmpeg encoder preset. Trades encode speed for file size at the same quality (CRF).\n\nultrafast - encodes ~10x faster, ~70% bigger file\nveryfast  - ~4x faster, ~25% bigger\nmedium    - baseline (default)\nslow      - ~30% slower, ~5% smaller\nveryslow  - 5x slower, ~15% smaller\n\nQuality is the SAME at every preset - only speed and size change. Hardware encoders (NVENC / QSV / AMF) ignore most values and only honor fast / medium / slow.',
    'disabled.byLossless': 'overridden by Lossless',
    'disabled.byBitrate': 'overridden by Bitrate',
    'disabled.byFitToSize': 'overridden by Fit to size',
    'disabled.byCopy': 'overridden by video codec: copy',
    'disabled.byVertical': 'overridden by Vertical 9:16',
    'disabled.byNoAudio': 'overridden by No audio',
    'est.working': 'estimating...',
    'est.total': '≈ {size} total',
    'est.tipSampled': 'Estimated output size.\n\nMeasured by actually encoding {secs}s of this clip with your current settings. On clips of a couple of minutes it usually lands within about 10%. Longer clips are judged on a smaller slice of the whole, so expect it to drift further.',
    'est.tipExact': 'Output size, measured by encoding the whole clip with your current settings.',
    'est.tipMath': 'Estimated output size, calculated from your bitrate and the clip length.',
  },
  pt: {
    'nav.convert': 'Converter', 'nav.history': 'Histórico', 'nav.settings': 'Definições', 'nav.debug': 'Depuração',
    'btn.addFiles': 'Adicionar ficheiros', 'btn.addFolder': 'Adicionar pasta',
    'btn.convertAll': 'Converter tudo', 'btn.cancelAll': 'Cancelar tudo', 'btn.clearCompleted': 'Limpar concluídos',
    'btn.reset': 'Repor', 'btn.browse': 'Procurar', 'btn.recheck': 'Verificar novamente', 'btn.download': 'Transferir',
    'btn.save': 'Guardar', 'btn.cancel': 'Cancelar', 'btn.close': 'Fechar',
    'btn.play': '▶ Reproduzir', 'btn.pause': '⏸ Pausa', 'btn.playRange': 'Reproduzir IN a OUT',
    'btn.previewInPlayer': '▶ Abrir no leitor',
    'btn.saveAs': '+ Guardar como...', 'btn.delete': 'Eliminar',
    'btn.addFolderWatch': '+ Adicionar pasta', 'btn.copyAll': 'Copiar tudo', 'btn.export': 'Exportar', 'btn.clear': 'Limpar',
    'btn.retry': 'Tentar novamente', 'btn.remove': 'Remover', 'btn.trim': '+ Cortar',
    'hint.dropFiles': 'ou larga ficheiros em qualquer parte da janela',
    'label.preset': 'Predefinição:', 'label.outputFormat': 'Formato de saída', 'label.outputFolder': 'Pasta de saída',
    'label.videoCodec': 'Codec de vídeo', 'label.quality': 'Qualidade (CRF)', 'label.bitrate': 'Taxa de bits (kbps)',
    'label.fitToSize': 'Tamanho-alvo (MB)', 'label.encPreset': 'Predefinição', 'label.resolution': 'Resolução',
    'label.vertical': 'Vertical 9:16', 'label.fps': 'Imagens por segundo',
    'label.audioCodec': 'Codec de áudio', 'label.audioBitrate': 'Taxa de bits de áudio (kbps)',
    'label.imageQuality': 'Qualidade da imagem',
    'toggle.lossless': 'Sem perdas', 'toggle.iphone': 'Compatível com iPhone / iPad',
    'toggle.stripMetadata': 'Remover metadados', 'toggle.hw': 'Aceleração por hardware',
    'toggle.deinterlace': 'Desentrelaçar', 'toggle.noAudio': 'Sem áudio',
    'footer.madeBy': 'Feito por', 'footer.support': 'Apoia este projeto',
    'footer.report': 'Reportar problema', 'footer.suggest': 'Sugerir funcionalidade',
    'footer.running': '{n} a converter', 'footer.queued': '{n} em fila', 'footer.completed': '{n} concluídos',
    'footer.saved': 'Poupado {size}', 'footer.added': 'Adicionado {size}',
    'trim.in': 'IN', 'trim.out': 'OUT', 'trim.length': 'Duração após corte',
    'trim.sourceDuration': 'Duração original:', 'trim.dragHint': 'Arrasta a pega verde para IN, a vermelha para OUT.',
    'trim.generating': 'A gerar pré-visualização...', 'trim.ready': 'Pronto', 'trim.unavail': 'Pré-visualização indisponível',
    'drop.title': 'Larga os ficheiros para converter', 'drop.sub': 'Suporta vídeo, áudio e imagens',
    'status.ffmpegOk': 'FFmpeg detetado', 'status.ffmpegMissingPrefix': 'FFmpeg não encontrado - ', 'install.link': 'instalar',
    'status.running': 'A converter', 'status.queued': 'Em fila', 'status.completed': 'Concluído',
    'status.failed': 'Falhou', 'status.cancelled': 'Cancelado', 'status.pending': 'Pendente',
    'tip.crf': 'CRF = Constant Rate Factor (Fator de Taxa Constante). O FFmpeg escolhe a taxa de bits automaticamente para manter esta qualidade percebida estável ao longo de todo o vídeo.\n\nQue número devo usar?\n\n0  - sem perdas (ficheiro enorme)\n16 - qualidade de arquivo\n18 - visualmente idêntico à fonte\n20 - excelente\n23 - bom (predefinição FFmpeg)\n28 - aceitável, ficheiro pequeno\n51 - pior\n\nNúmero mais baixo = melhor qualidade + ficheiro maior. Cada +6 duplica aproximadamente o tamanho.\n\nSó se aplica a libx264 / libx265. Ignorado se "Tamanho-alvo" ou "Taxa de bits" estiverem definidos.',
    'tip.bitrate': 'Taxa de bits de vídeo em kilobits por segundo. 0 = usar CRF (recomendado). Mais alto = melhor qualidade, ficheiro maior.',
    'tip.fitToSize': 'Tamanho final do ficheiro em megabytes. O Format Reaper calcula a taxa de bits necessária para atingir este tamanho (com 5% de margem) e ignora CRF/Bitrate. 0 = desativado. Valores comuns: 8 (Discord grátis), 25 (Nitro Basic), 50 (Nitro), 100 (Reddit), 4096 (limite Reels do Instagram).',
    'tip.vertical': 'Saída para Reels / TikTok / Shorts.\nOff: mantém o aspeto original.\nCenter crop: corta as laterais (perde conteúdo).\nBlurred fit: ajusta à largura + fundo desfocado preenche as barras (estilo Premiere, mantém tudo visível).\nSaída sempre a 1080x1920.',
    'tip.imageQuality': 'Nível de qualidade para formatos com perdas. 100 = quase sem perdas, 1 = mínimo. 85-95 é o ponto ideal para JPG/WebP.',
    'tip.lossless': 'Converter sem qualquer perda de qualidade. No vídeo desativa bitrate/CRF e usa codificação verdadeiramente sem perdas (ficheiros muito maiores). Em imagens, apenas formatos que suportam sem perdas (PNG, WebP, AVIF, TIFF) ficam perfeitos.',
    'tip.iphone': 'Força definições compatíveis com dispositivos Apple: formato de píxel yuv420p, tag hvc1 para HEVC e flag faststart para o ficheiro fazer streaming a partir de qualquer ponto. Recomendado para AirDrop / Fotos.',
    'tip.stripMetadata': 'Remove EXIF, GPS, info da câmara e tags de codificação. Útil antes de partilhar online.',
    'tip.hw': 'Usa codificação por GPU quando disponível (NVENC / QSV / VideoToolbox / VAAPI / AMF). Muito mais rápido, com ficheiros ligeiramente maiores para a mesma qualidade.',
    'tip.deinterlace': 'Remove os artefactos em pente que aparecem em fontes entrelaçadas. Ativa para MTS / M2TS / MPEG-TS de câmaras de vídeo e DVDs antigos. Aplica o filtro yadif.',
    'tip.noAudio': 'Remove o áudio do ficheiro de saída. Útil para clips silenciosos ou quando vais adicionar o teu próprio áudio. Desativa todas as definições de áudio.',
    'tip.maxConcurrent': 'Quantos ficheiros são convertidos em paralelo. Mais alto = lote mais rápido, mas cada um demora mais. Com aceleração por hardware, 1-2 costuma ser o melhor. Em CPU podes aumentar.',
    'tip.watchFolders': 'O Format Reaper observa cada pasta enquanto a app está aberta. Qualquer novo ficheiro de média que apareça na pasta é automaticamente colocado em fila com a predefinição escolhida e começa a converter assim que o tamanho do ficheiro estabiliza. A saída vai para a pasta predefinida.',
    'tip.debug': 'Adiciona um painel de Depuração na barra lateral com registos em tempo real de cada invocação do FFmpeg, sondagem de ficheiros e evento de conversão. O comando completo usado em cada trabalho fica registado para o poderes voltar a executar manualmente.',
    'tip.encPreset': 'Predefinição de codificação do FFmpeg. Troca velocidade de codificação por tamanho do ficheiro com a mesma qualidade (CRF).\n\nultrafast - codifica ~10x mais rápido, ficheiro ~70% maior\nveryfast  - ~4x mais rápido, ~25% maior\nmedium    - referência (predefinido)\nslow      - ~30% mais lento, ~5% menor\nveryslow  - 5x mais lento, ~15% menor\n\nA qualidade é IGUAL em todas as predefinições - só mudam velocidade e tamanho. Encoders por hardware (NVENC / QSV / AMF) só respeitam fast / medium / slow.',
    'disabled.byLossless': 'ignorado por Sem perdas',
    'disabled.byBitrate': 'ignorado pela Taxa de bits',
    'disabled.byFitToSize': 'ignorado pelo Tamanho-alvo',
    'disabled.byCopy': 'ignorado pelo codec de vídeo: copy',
    'disabled.byVertical': 'ignorado por Vertical 9:16',
    'disabled.byNoAudio': 'ignorado por Sem áudio',
    'est.working': 'a estimar...',
    'est.total': '≈ {size} no total',
    'est.tipSampled': 'Tamanho estimado do ficheiro final.\n\nMedido codificando mesmo {secs}s deste clip com as tuas definições atuais. Em clips de poucos minutos costuma ficar a cerca de 10% do real. Clips longos são avaliados a partir de uma fatia menor do total, por isso conta com mais desvio.',
    'est.tipExact': 'Tamanho do ficheiro final, medido codificando o clip inteiro com as tuas definições atuais.',
    'est.tipMath': 'Tamanho estimado, calculado a partir da taxa de bits e da duração do clip.',
  }
};

let currentLang = localStorage.getItem('fr_lang') || 'en';

function t(key, params) {
  let str = (I18N[currentLang] && I18N[currentLang][key]);
  if (str == null) str = (I18N.en && I18N.en[key]);
  if (str == null) return key;
  if (params) {
    Object.keys(params).forEach(k => { str = str.split('{' + k + '}').join(String(params[k])); });
  }
  return str;
}

function applyLanguage(lang) {
  if (lang !== 'en' && lang !== 'pt') lang = 'en';
  currentLang = lang;
  localStorage.setItem('fr_lang', lang);
  document.documentElement.lang = lang === 'pt' ? 'pt' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-tip]').forEach(el => {
    el.setAttribute('data-tip', t(el.dataset.i18nTip));
  });
  document.querySelectorAll('.lang-switcher button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  // Force any dynamic UI to re-render with the new strings
  if (typeof renderJobs === 'function') { try { renderJobs(); } catch {} }
  if (typeof renderHistory === 'function' && document.getElementById('panel-history') && document.getElementById('panel-history').classList.contains('active')) {
    try { renderHistory(); } catch {}
  }
  if (typeof updateFooter === 'function') { try { updateFooter(); } catch {} }
  if (typeof checkFfmpegEnv === 'function') { try { checkFfmpegEnv(true); } catch {} }
  if (typeof updateFormConflicts === 'function') { try { updateFormConflicts(); } catch {} }
}

document.querySelectorAll('.lang-switcher button').forEach(btn => {
  btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
});

// Clamp every numeric input that declares min/max on change/blur, so a user can't
// type 99999999 into Bitrate or Target size and watch the conversion explode.
document.addEventListener('change', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== 'number') return;
  const min = el.min !== '' ? parseFloat(el.min) : -Infinity;
  const max = el.max !== '' ? parseFloat(el.max) : Infinity;
  if (el.value === '') return;
  const n = parseFloat(el.value);
  if (!isFinite(n)) { el.value = String(Math.max(0, isFinite(min) ? min : 0)); return; }
  if (n < min) el.value = String(min);
  else if (n > max) el.value = String(max);
}, true);

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
    if (wrap.classList.contains('disabled')) return;
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

// ── Theme ──
let currentTheme = localStorage.getItem('fr_theme') === 'light' ? 'light' : 'dark';

function applyTheme(theme) {
  currentTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('fr_theme', currentTheme);
  const btn = $('#themeToggle');
  if (btn) {
    // The icon shows the theme you would switch TO, same as NoteStash.
    btn.textContent = currentTheme === 'dark' ? '☀' : '☾';
    btn.title = currentTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
}
applyTheme(currentTheme);
$('#themeToggle').addEventListener('click', () => {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

// ── Job list view mode ──
let listView = localStorage.getItem('fr_listView') === 'grid' ? 'grid' : 'list';

function applyListView(mode) {
  listView = mode === 'grid' ? 'grid' : 'list';
  jobList.classList.toggle('grid', listView === 'grid');
  localStorage.setItem('fr_listView', listView);
  const label = $('#viewToggleLabel');
  const btn = $('#viewToggle');
  // The label names the view you would switch TO.
  if (label) label.textContent = listView === 'grid' ? 'List' : 'Grid';
  if (btn) btn.title = listView === 'grid' ? 'Switch to list view' : 'Switch to grid view';
}
applyListView(listView);
$('#viewToggle').addEventListener('click', () => {
  applyListView(listView === 'grid' ? 'list' : 'grid');
});

// Presets
// Video presets spell out targetSizeMb / verticalMode / metadata / noAudio too, even
// though they are all "off". Applying a preset should reset the whole video pipeline,
// and the modified marker can only notice a field the preset actually claims.
const BUILTIN_PRESETS = {
  'iPhone 4K HEVC':       { format: 'mp4',  videoCodec: 'libx265', crf: 20, vbitrate: 0, preset: 'medium', resolution: 'keep',  fps: 0,  audioCodec: 'aac',     abitrate: 192, iphone: true,  lossless: false, hw: true,  deinterlace: false, targetSizeMb: 0, verticalMode: 'off', metadata: false, noAudio: false },
  'iPhone 1080p':         { format: 'mp4',  videoCodec: 'libx265', crf: 22, vbitrate: 0, preset: 'medium', resolution: '1080p', fps: 0,  audioCodec: 'aac',     abitrate: 192, iphone: true,  lossless: false, hw: true,  deinterlace: false, targetSizeMb: 0, verticalMode: 'off', metadata: false, noAudio: false },
  'Instagram (iPhone)':   { format: 'mp4',  videoCodec: 'libx264', crf: 21, vbitrate: 0, preset: 'medium', resolution: '1080p', fps: 30, audioCodec: 'aac',     abitrate: 128, iphone: true,  lossless: false, hw: true,  deinterlace: true,  targetSizeMb: 0, verticalMode: 'off', metadata: false, noAudio: false },
  'MP4 H.264':            { format: 'mp4',  videoCodec: 'libx264', crf: 20, vbitrate: 0, preset: 'medium', resolution: 'keep',  fps: 0,  audioCodec: 'aac',     abitrate: 192, iphone: false, lossless: false, hw: true,  deinterlace: false, targetSizeMb: 0, verticalMode: 'off', metadata: false, noAudio: false },
  'WebM VP9':             { format: 'webm', videoCodec: 'libvpx-vp9', crf: 30, vbitrate: 0, preset: 'medium', resolution: 'keep', fps: 0, audioCodec: 'libopus', abitrate: 128, iphone: false, lossless: false, hw: false, deinterlace: false, targetSizeMb: 0, verticalMode: 'off', metadata: false, noAudio: false },
  'Audio MP3 320k':       { format: 'mp3',  audioOnlyCodec: 'libmp3lame', audioOnlyBitrate: 320 },
  'Lossless MKV':         { format: 'mkv',  videoCodec: 'libx265', preset: 'medium', resolution: 'keep', fps: 0, audioCodec: 'copy', iphone: false, lossless: true, hw: false, deinterlace: false, targetSizeMb: 0, verticalMode: 'off', metadata: false, noAudio: false },
  'Camcorder MTS clean':  { format: 'mp4',  videoCodec: 'libx265', crf: 20, vbitrate: 0, preset: 'medium', resolution: 'keep',  fps: 0,  audioCodec: 'aac',     abitrate: 256, iphone: true,  lossless: false, hw: true,  deinterlace: true,  targetSizeMb: 0, verticalMode: 'off', metadata: false, noAudio: false },
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

const CUSTOM_PRESET_KEY = 'builtin:Custom (no preset)';

function presetDataForKey(key) {
  if (!key) return null;
  if (key.startsWith('builtin:')) return BUILTIN_PRESETS[key.slice('builtin:'.length)] || null;
  if (key.startsWith('custom:')) return loadCustomPresets()[key.slice('custom:'.length)] || null;
  return null;
}

// Presets only define the keys they care about, so compare those and ignore the rest.
// Both sides come from snapshotForm's fixed shape, so a string compare is enough.
function presetMatchesForm(data) {
  if (!data || data.__noop) return true;
  const snap = snapshotForm();
  for (const [k, v] of Object.entries(data)) {
    if (k === '__noop' || !(k in snap)) continue;
    if (String(snap[k]) !== String(v)) return false;
  }
  return true;
}

// The dropdown is the thing you trust to tell you what is about to run. The moment the
// form stops matching the preset it is showing, it drops to Custom rather than keep
// claiming a name that is no longer true.
function syncPresetSelection() {
  const dd = $('#presetDropdown');
  if (!dd) return;
  const key = dd.value || '';
  if (key === CUSTOM_PRESET_KEY) return;
  const data = presetDataForKey(key);
  if (!data || data.__noop || presetMatchesForm(data)) return;
  dd.value = CUSTOM_PRESET_KEY;
  // Deliberately NOT written to localStorage. The individual form fields are not
  // persisted - on launch the form is rebuilt by re-applying the saved preset - so
  // saving "Custom" here would leave nothing to restore and the next launch would come
  // up on the bare defaults instead of the preset the user last chose on purpose.
  settings.preset = CUSTOM_PRESET_KEY;
  updateDeleteBtn();
  dlog('event', 'Settings no longer match the preset - switched to Custom');
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
  if (typeof refreshWatchPresetSelect === 'function') refreshWatchPresetSelect();
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
  if (typeof refreshWatchPresetSelect === 'function') refreshWatchPresetSelect();
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

function setGroupDisabled(input, disabled, _reasonKey) {
  if (!input) return;
  const g = input.closest('.form-group');
  if (!g) return;
  g.classList.toggle('disabled', !!disabled);
  // Clean up any leftover hint elements from earlier builds.
  const hint = g.querySelector('.form-disabled-hint');
  if (hint) hint.remove();
}

// The checkbox-style toggles are plain divs, not form controls, so they need their own
// disabled treatment. bindToggle ignores clicks while the wrapper carries this class.
function setToggleDisabled(wrapId, disabled) {
  const wrap = document.getElementById(wrapId);
  if (wrap) wrap.classList.toggle('disabled', !!disabled);
}

function applyAudioDisabledState() {
  const off = !!formState.noAudio;
  const kind = formatKind(formatSelect.value);
  setGroupDisabled(audioCodec, off && kind === 'video', off ? 'disabled.byNoAudio' : null);
  setGroupDisabled(abitrateInput, off && kind === 'video', off ? 'disabled.byNoAudio' : null);
  setGroupDisabled(audioOnlyCodec, off && kind === 'audio', off ? 'disabled.byNoAudio' : null);
  setGroupDisabled(audioOnlyBitrate, off && kind === 'audio', off ? 'disabled.byNoAudio' : null);
}

function updateFormConflicts() {
  applyAudioDisabledState();

  // These two apply to every output kind, so they run before the video-only guard below.
  syncPresetSelection();
  scheduleEstimates();

  const kind = formatKind(formatSelect.value);
  if (kind !== 'video') return;

  const lossless = !!formState.lossless;
  const targetMB = parseInt(targetSizeMbInput.value, 10) || 0;
  const vbitrate = parseInt(vbitrateInput.value, 10) || 0;
  const isCopy = videoCodec.value === 'copy';
  const vmode = verticalModeSelect.value || 'off';
  const vertOn = vmode !== 'off';

  // Reason precedence: copy > lossless > fit-to-size > bitrate
  const blanket = isCopy ? 'disabled.byCopy' : lossless ? 'disabled.byLossless' : null;

  // CRF: disabled by copy, lossless, fit-to-size, or bitrate
  let crfReason = blanket;
  if (!crfReason && targetMB > 0) crfReason = 'disabled.byFitToSize';
  else if (!crfReason && vbitrate > 0) crfReason = 'disabled.byBitrate';
  setGroupDisabled(crfInput, !!crfReason, crfReason);

  // Bitrate: disabled by copy, lossless, fit-to-size
  let brReason = blanket;
  if (!brReason && targetMB > 0) brReason = 'disabled.byFitToSize';
  setGroupDisabled(vbitrateInput, !!brReason, brReason);

  // Fit to size: disabled by copy or lossless
  setGroupDisabled(targetSizeMbInput, !!blanket, blanket);

  // Encoding preset: disabled by copy
  setGroupDisabled(presetSelect, isCopy, isCopy ? 'disabled.byCopy' : null);

  // Resolution: disabled by copy or active Vertical mode (vertical forces 1080x1920)
  const resReason = isCopy ? 'disabled.byCopy' : vertOn ? 'disabled.byVertical' : null;
  setGroupDisabled(resolutionSelect, !!resReason, resReason);

  // FPS: disabled by copy
  setGroupDisabled(fpsSelect, isCopy, isCopy ? 'disabled.byCopy' : null);

  // Vertical mode: disabled by copy
  setGroupDisabled(verticalModeSelect, isCopy, isCopy ? 'disabled.byCopy' : null);

  // Copy hands the video through untouched, so every encoder-side toggle is ignored:
  // the backend writes "-c:v copy" and skips the whole encoder block. Deinterlace is
  // worse than ignored - ffmpeg refuses to run a filter alongside a stream copy, so
  // leaving it reachable lets the user build a job that cannot run.
  setToggleDisabled('losslessToggleWrap', isCopy);
  setToggleDisabled('iphoneToggleWrap', isCopy);
  setToggleDisabled('hwToggleWrap', isCopy);
  setToggleDisabled('deinterlaceToggleWrap', isCopy);
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
  updateFormConflicts();
}
// The two fields that persist themselves. Everything else is handled by the delegated
// listener below, so nothing here calls updateFormConflicts twice for one edit.
targetSizeMbInput.addEventListener('change', () => {
  localStorage.setItem('fr_targetSizeMb', String(parseInt(targetSizeMbInput.value, 10) || 0));
});
verticalModeSelect.addEventListener('change', () => {
  localStorage.setItem('fr_verticalMode', verticalModeSelect.value);
});

// One delegated listener for the whole form. Output Folder is excluded: it sits inside
// .convert-form but cannot change the output size, and estimating is expensive.
const NON_ENCODING_FIELDS = new Set(['outputDir']);
$('.convert-form').addEventListener('change', (e) => {
  if (e.target && NON_ENCODING_FIELDS.has(e.target.id)) return;
  // Format changes also swap which option rows are visible.
  if (e.target === formatSelect) onFormChange();
  else updateFormConflicts();
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
  scheduleEstimates();
  dlog('event', `Added to queue: ${filename}`);
}

// What fit-to-size reserves for audio when the bitrate field is left blank.
const FIT_DEFAULT_AUDIO_KBPS = 192;

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
      const audioKbps = opt.noAudio ? 0 : (opt.audioBitrateKbps || FIT_DEFAULT_AUDIO_KBPS);
      // ffmpeg reads a "k" bitrate suffix as 1000 bits, so the budget has to be in the
      // same units. Deriving it with 1024 made every fit-to-size job undershoot by a
      // further 2.4% on top of the intended 5% margin.
      const totalKbpsBudget = (targetMB * 1048576 * 8 * 0.95) / 1000 / effectiveDur;
      const videoKbps = Math.max(50, Math.floor(totalKbpsBudget - audioKbps));
      opt.videoBitrateKbps = videoKbps;
      opt.crf = null;
      // Pin the audio to what we actually reserved, so the encoder cannot spend a
      // different amount than the budget assumed.
      if (!opt.noAudio) opt.audioBitrateKbps = audioKbps;
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

// ── Output size estimates ──
// CRF and lossless have no fixed relationship to source size, so for those we encode
// a few short windows with the user's real settings and scale up. Everything else is
// arithmetic and answered instantly.
const ESTIMATE_DEBOUNCE_MS = 700;
const ESTIMATE_CACHE_MAX = 200;
const estimateCache = new Map();
let estimateTimer = null;
let estimateGeneration = 0;
let estimateRunning = false;
let estimateRerun = false;

// What the backend picks when Audio Codec is left on Auto. Mirrors
// audio_codec_for_container in converter.rs. Only used to decide whether the size
// follows from the bitrate, so an unknown container falls through to sampling, which
// is always correct - just slower.
const CONTAINER_AUDIO_DEFAULT = {
  mp4: 'aac', mov: 'aac', mkv: 'aac', m4a: 'aac',
  webm: 'libopus', avi: 'libmp3lame', mp3: 'libmp3lame',
  ogg: 'libvorbis', wav: 'pcm_s16le', flac: 'flac', opus: 'libopus',
};
// Codecs that ignore -b:a entirely, so bitrate arithmetic would be meaningless.
const FIXED_RATE_AUDIO = ['flac', 'pcm_s16le', 'copy'];

function scheduleEstimates() {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(() => {
    runEstimates().catch(e => dlog('warn', `Estimate pass failed: ${e}`));
  }, ESTIMATE_DEBOUNCE_MS);
}

function cacheEstimate(key, val) {
  // Plain insertion-order LRU: Map keeps insertion order, so the first key is the oldest.
  if (estimateCache.size >= ESTIMATE_CACHE_MAX) {
    estimateCache.delete(estimateCache.keys().next().value);
  }
  estimateCache.set(key, val);
}

// Only jobs the convert path would actually accept. Mirrors the cross-kind rule in
// convertAll, so we never burn a sample encode on a combination the app refuses.
function estimatableJobs() {
  const targetKind = formatKind(formatSelect.value);
  if (targetKind === 'image') return [];
  return jobs.filter(j =>
    j.kind !== 'image' &&
    j.duration > 0 &&
    (targetKind === j.kind || (j.kind === 'video' && targetKind === 'audio')) &&
    (j.status === 'Pending' || j.status === 'Failed' || j.status === 'Cancelled')
  );
}

// How many files are measured at once. Each one can spawn several ffmpeg processes of
// its own, so going wider than this makes every individual estimate slower and starves
// any real conversion running alongside.
const ESTIMATE_CONCURRENCY = 4;

// One pass at a time. Sample encodes take far longer than the debounce, so without this
// each settings change would stack another full set of ffmpeg processes on top of the
// last, all but the newest destined to be thrown away.
async function runEstimates() {
  if (estimateRunning) { estimateRerun = true; return; }
  estimateRunning = true;
  try {
    do {
      estimateRerun = false;
      const gen = ++estimateGeneration;
      const queue = estimatableJobs();

      // Mark the whole batch up front so every row says "estimating..." straight away.
      // Revealing them one at a time made it look like the app had stalled on one file.
      for (const job of queue) {
        job.estimating = true;
        paintEstimate(job);
      }

      let next = 0;
      const worker = async () => {
        while (next < queue.length) {
          if (gen !== estimateGeneration || estimateRerun) return;
          const job = queue[next++];
          await estimateJob(job, gen);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(ESTIMATE_CONCURRENCY, queue.length) }, worker)
      );

      // Anything left marked from an abandoned pass has to be cleared, or its row keeps
      // claiming to be working when nothing is.
      for (const job of queue) {
        if (job.estimating) clearEstimating(job);
      }
    } while (estimateRerun);
  } finally {
    estimateRunning = false;
  }
}

function stopEstimates() {
  clearTimeout(estimateTimer);
  estimateGeneration++;
  estimateRerun = false;
}

// Cases where the size follows directly from the settings, no encoding needed.
function arithmeticEstimate(job, opt) {
  const dur = computeTrimmedDuration(job.duration, job.trimStart, job.trimEnd);
  if (!(dur > 0)) return null;

  const audioKbps = opt.noAudio ? 0 : (opt.audioBitrateKbps || 0);
  const audioCodec = opt.audioCodec || CONTAINER_AUDIO_DEFAULT[opt.container] || null;

  // Both streams passed through untouched, so the output tracks the input size.
  // "No audio" deliberately does not qualify: it drops a track whose size we do not
  // know, so that case falls through to a real measurement.
  if (opt.videoCodec === 'copy' && opt.audioCodec === 'copy') {
    const ratio = job.duration > 0 ? dur / job.duration : 1;
    return { bytes: Math.round(job.inputSize * ratio), kind: 'math' };
  }
  if (!opt.lossless && opt.videoBitrateKbps > 0) {
    return { bytes: Math.round(((opt.videoBitrateKbps + audioKbps) * 1000 * dur) / 8), kind: 'math' };
  }
  // opt.kind, not job.kind: a video file being converted to audio runs the audio path.
  if (opt.kind === 'audio' && audioKbps > 0 && audioCodec && !FIXED_RATE_AUDIO.includes(audioCodec)) {
    return { bytes: Math.round((audioKbps * 1000 * dur) / 8), kind: 'math' };
  }
  return null;
}

async function estimateJob(job, gen) {
  let opt;
  try {
    // The conversion is built from the OUTPUT format's kind, not the source file's,
    // so the estimate has to model the same thing or it measures a different command.
    opt = buildOptions(formatKind(formatSelect.value), job);
  } catch (e) {
    dlog('warn', `Estimate skipped for ${job.filename}: ${e}`);
    return;
  }
  const key = job.inputPath + '|' + JSON.stringify(opt);

  const cached = estimateCache.get(key);
  if (cached) { applyEstimate(job, cached); return; }

  const math = arithmeticEstimate(job, opt);
  if (math) {
    cacheEstimate(key, math);
    applyEstimate(job, math);
    return;
  }

  // runEstimates already flagged the whole batch; this covers any other caller.
  if (!job.estimating) {
    job.estimating = true;
    paintEstimate(job);
  }

  try {
    const res = await invoke('estimate_output_size', {
      inputPath: job.inputPath,
      durationSeconds: job.duration,
      options: opt,
    });
    if (gen !== estimateGeneration) { clearEstimating(job); return; }
    const val = {
      bytes: res.bytes,
      kind: res.exact ? 'exact' : 'sampled',
      sampledSeconds: res.sampledSeconds || 0,
    };
    cacheEstimate(key, val);
    applyEstimate(job, val);
  } catch (e) {
    dlog('warn', `Estimate failed for ${job.filename}: ${e}`);
    if (gen !== estimateGeneration) { clearEstimating(job); return; }
    job.estimateBytes = 0;
    clearEstimating(job);
  }
}

// Always clear the in-progress flag, including on the abandoned-pass paths. A job that
// leaves the pending list mid-estimate is never revisited, so a leaked flag would pin
// its row to "estimating..." for good.
function clearEstimating(job) {
  job.estimating = false;
  paintEstimate(job);
}

function applyEstimate(job, val) {
  job.estimating = false;
  job.estimateBytes = val.bytes;
  job.estimateKind = val.kind;
  job.estimateSampledSeconds = val.sampledSeconds || 0;
  paintEstimate(job);
}

function estimateTooltip(job) {
  if (job.estimateKind === 'exact') return t('est.tipExact');
  if (job.estimateKind === 'math') return t('est.tipMath');
  return t('est.tipSampled', { secs: Math.round(job.estimateSampledSeconds || 0) });
}

// The size cell, rendered on its own so an arriving estimate can repaint just this
// span instead of the whole row (which would tear down an open trim editor).
function sizeCellHTML(job) {
  const base = fmtBytes(job.inputSize);
  if (job.outputSize) return `${base} &rarr; ${fmtBytes(job.outputSize)}`;
  if (job.estimating) return `${base} <span class="dl-est working">${escapeHtml(t('est.working'))}</span>`;
  if (job.estimateBytes > 0) {
    const approx = job.estimateKind === 'exact' ? '' : '~';
    return `${base} &rarr; <span class="dl-est" title="${escapeHtml(estimateTooltip(job))}">${approx}${fmtBytes(job.estimateBytes)}</span>`;
  }
  return base;
}

function paintEstimate(job) {
  const el = jobList.querySelector(`.dl-item[data-id="${job.id}"] .dl-size`);
  if (el) el.innerHTML = sizeCellHTML(job);
  updateFooter();
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
    // suffix: name the codec when we can, because that is the useful thing to know.
    let codecSuffix = null;
    if (kind === 'video') {
      const vc = videoCodec.value;
      if (vc === 'libx265') codecSuffix = 'h265';
      else if (vc === 'libx264') codecSuffix = 'h264';
      else if (vc === 'libvpx-vp9') codecSuffix = 'vp9';
      else if (vc === 'libaom-av1') codecSuffix = 'av1';
    }
    if (codecSuffix) {
      outName = `${base}_${codecSuffix}.${outFormat}`;
    } else {
      // Copy, Auto, and every audio or image job: there is no codec worth naming, so a
      // suffix would only be noise ("clip_mov.mov"). The one thing it still buys is not
      // landing on top of the source, which can only happen if the extension matches.
      const inExt = (filename.split('.').pop() || '').toLowerCase();
      outName = inExt === outFormat.toLowerCase()
        ? `${base}_converted.${outFormat}`
        : `${base}.${outFormat}`;
    }
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

  // Real conversions get the CPU from here on; a queued estimate pass must not compete.
  stopEstimates();

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
    const editorEl = el.querySelector('[data-trim-editor]');
    if (editorEl && job.trimExpanded) {
      ensureThumbnailsForJob(job, editorEl).catch(e => {
        editorEl.innerHTML = `<div class="dl-trim-error">Could not generate thumbnails: ${escapeHtml(String(e))}</div>`;
        dlog('error', `Thumbnail extract failed for ${job.filename}: ${e}`);
      });
    }
  }
  Object.values(existing).forEach(el => el.remove());
  updateFooter();
}

function renderJobHTML(job) {
  const status = job.status.toLowerCase();
  const statusLabel = t('status.' + status) || job.status;
  const statusBadge = `<span class="dl-status ${status}">${escapeHtml(statusLabel)}</span>`;
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

  // Trim editor: only for video jobs that have not started yet (and have duration)
  const trimmable = job.kind === 'video'
    && job.duration > 0
    && (job.status === 'Pending' || job.status === 'Failed' || job.status === 'Cancelled');
  let trimBlock = '';
  if (trimmable) {
    const trimOn = !!(job.trimStart || job.trimEnd);
    trimBlock = `<button class="dl-trim-toggle ${trimOn ? 'on' : ''}" data-action="trim-toggle">${trimOn ? `${escapeHtml(t('btn.trim').replace(/^\+\s*/, ''))} ${escapeHtml(job.trimStart || '0')} - ${escapeHtml(job.trimEnd || (currentLang === 'pt' ? 'fim' : 'end'))}` : escapeHtml(t('btn.trim'))}</button>`;
  }

  const trimEditor = (trimmable && job.trimExpanded)
    ? `<div class="dl-trim-editor" data-trim-editor="1">
         <div class="dl-trim-loading">Generating preview thumbnails...</div>
       </div>`
    : '';

  return `
    <div class="dl-row-top">
      <span class="dl-filename" title="${escapeHtml(job.inputPath)}">${escapeHtml(job.filename)}</span>
      <span class="dl-size">${sizeCellHTML(job)}</span>
      ${speedEta}
      ${statusBadge}
      <div class="dl-actions">${trimBlock}${revealBtn}${actions}</div>
    </div>
    <div class="dl-progress-wrap"><div class="dl-progress-bar ${status}" style="width:${progress}%"></div></div>
    <div class="dl-row-bottom">
      <span class="dl-url" title="${escapeHtml(job.outputPath || '')}">${escapeHtml(outName)}</span>
      <span class="dl-arrow">${job.kind} → ${formatSelect.value}</span>
    </div>
    ${trimEditor}
    ${errorBox}
  `;
}

const THUMB_COUNT = 32;
const thumbCache = new Map(); // jobInputPath -> [{path, timeSeconds}]
const thumbInflight = new Map(); // jobInputPath -> Promise<thumbs>

// Listen once for streamed thumbnail-ready events
let thumbStreamSubscribePromise = null;
function subscribeThumbnailStream() {
  if (thumbStreamSubscribePromise) return thumbStreamSubscribePromise;
  thumbStreamSubscribePromise = listen('thumbnail-ready', (e) => {
    const p = e.payload || {};
    const inputPath = p.inputPath;
    const index = p.index;
    if (inputPath == null || index == null) return;
    const url = p.dataUrl || '';
    if (!url) return;
    const selector = `[data-trim-thumb][data-input-key="${trimKey(inputPath)}"][data-index="${index}"]`;
    const slots = document.querySelectorAll(selector);
    slots.forEach(slot => {
      slot.style.backgroundImage = `url("${url}")`;
      slot.classList.add('loaded');
      const editor = slot.closest('[data-trim-editor]');
      if (editor) {
        const preview = editor.querySelector('[data-trim-preview-img]');
        if (preview && !preview.style.backgroundImage) {
          preview.style.backgroundImage = slot.style.backgroundImage;
        }
      }
    });
  }).catch(err => {
    dlog('error', 'Thumbnail event subscription failed: ' + err);
    thumbStreamSubscribePromise = null;
  });
  return thumbStreamSubscribePromise;
}
// Encode an arbitrary string to a token that is safe to use as both
// an HTML attribute value AND a CSS attribute selector value (no quotes,
// no backslashes, no whitespace). encodeURIComponent gives us alphanumerics +
// "-._~!*'()" and percent-escapes the rest.
function trimKey(s) {
  return encodeURIComponent(String(s));
}

async function ensureThumbnailsForJob(job, editorEl) {
  // Await the subscription so we do not miss the first events when extract_thumbnails
  // fires them faster than the listener can register.
  await subscribeThumbnailStream();

  const cached = thumbCache.get(job.inputPath);
  // Render the timeline scaffolding RIGHT NOW so the user sees the editor instantly.
  renderTrimTimeline(job, editorEl, cached || null);

  if (cached) return cached;

  let pending = thumbInflight.get(job.inputPath);
  if (!pending) {
    const t0 = performance.now();
    dlog('info', `Extracting ${THUMB_COUNT} thumbnails for ${job.filename} (${job.duration ? job.duration.toFixed(1) : '?'}s)`);
    pending = invoke('extract_thumbnails', {
      inputPath: job.inputPath,
      count: THUMB_COUNT,
      durationSeconds: job.duration || 0,
    }).then(thumbs => {
      thumbCache.set(job.inputPath, thumbs);
      thumbInflight.delete(job.inputPath);
      dlog('info', `Generated ${thumbs.length} thumbnails for ${job.filename} in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
      return thumbs;
    }).catch(e => {
      thumbInflight.delete(job.inputPath);
      dlog('error', `Thumbnail extraction failed for ${job.filename}: ${e}`);
      throw e;
    });
    thumbInflight.set(job.inputPath, pending);
  }
  return pending;
}

function thumbTime(t) {
  return t.timeSeconds != null ? t.timeSeconds : t.time_seconds;
}

function nearestThumb(thumbs, targetSec) {
  let best = thumbs[0];
  let bestDiff = Infinity;
  for (const t of thumbs) {
    const d = Math.abs(thumbTime(t) - targetSec);
    if (d < bestDiff) { bestDiff = d; best = t; }
  }
  return best;
}

function renderTrimTimeline(job, editorEl, thumbs) {
  const duration = job.duration;
  const inputKey = trimKey(job.inputPath);
  const thumbUrl = (t) => (t && (t.dataUrl || t.data_url)) || '';

  // Initialize trim values if unset
  let startSec = parseTimeToSeconds(job.trimStart);
  let endSec = parseTimeToSeconds(job.trimEnd);
  if (!isFinite(startSec) || startSec < 0) startSec = 0;
  if (!isFinite(endSec) || endSec <= 0 || endSec > duration) endSec = duration;
  if (startSec >= endSec) { startSec = 0; endSec = duration; }

  // Build slot HTML: cached thumbs already populated, others wait for the streamed event.
  const slots = [];
  for (let i = 0; i < THUMB_COUNT; i++) {
    const url = thumbs && thumbs[i] ? thumbUrl(thumbs[i]) : '';
    const bg = url ? `style="background-image:url('${url}')"` : '';
    slots.push(`<div class="dl-trim-thumb${url ? ' loaded' : ''}" data-trim-thumb data-input-key="${inputKey}" data-index="${i}" ${bg}></div>`);
  }

  editorEl.innerHTML = `
    <div class="dl-trim-preview">
      <div class="dl-trim-preview-pane" data-trim-preview-pane>
        <div class="dl-trim-preview-img" data-trim-preview-img></div>
        <div class="dl-trim-preview-status" data-trim-preview-status>${escapeHtml(t('trim.generating'))}</div>
      </div>
      <div class="dl-trim-preview-info">
        <div class="dl-trim-preview-time" data-trim-preview-time></div>
        <div>${escapeHtml(t('trim.sourceDuration'))} <strong>${fmtTime(duration)}</strong></div>
        <div>${escapeHtml(t('trim.dragHint'))}</div>
        <div class="dl-trim-preview-controls" data-trim-preview-controls style="display:none;">
          <button data-trim-play>${escapeHtml(t('btn.play'))}</button>
          <button data-trim-pause disabled>${escapeHtml(t('btn.pause'))}</button>
          <button data-trim-play-range>${escapeHtml(t('btn.playRange'))}</button>
        </div>
      </div>
    </div>
    <div class="dl-trim-timeline" data-trim-timeline>
      <div class="dl-trim-timeline-thumbs">
        ${slots.join('')}
      </div>
      <div class="dl-trim-mask left" data-trim-mask-left></div>
      <div class="dl-trim-mask right" data-trim-mask-right></div>
      <div class="dl-trim-range-band" data-trim-range></div>
      <div class="dl-trim-playhead" data-trim-playhead></div>
      <div class="dl-trim-handle in" data-trim-handle="in"></div>
      <div class="dl-trim-handle out" data-trim-handle="out"></div>
    </div>
    <div class="dl-trim-footer">
      <span>${escapeHtml(t('trim.in'))} <span class="trim-label-in" data-trim-in-label></span></span>
      <span>${escapeHtml(t('trim.out'))} <span class="trim-label-out" data-trim-out-label></span></span>
      <span>${escapeHtml(t('trim.length'))} <span class="trim-len" data-trim-len-label></span></span>
      <button class="btn btn-ghost btn-sm" data-trim-play-btn>${escapeHtml(t('btn.previewInPlayer'))}</button>
      <button class="btn btn-ghost btn-sm" data-action="trim-clear">${escapeHtml(t('btn.reset'))}</button>
    </div>
  `;

  const timeline = editorEl.querySelector('[data-trim-timeline]');
  const handleIn = editorEl.querySelector('[data-trim-handle="in"]');
  const handleOut = editorEl.querySelector('[data-trim-handle="out"]');
  const maskLeft = editorEl.querySelector('[data-trim-mask-left]');
  const maskRight = editorEl.querySelector('[data-trim-mask-right]');
  const rangeBand = editorEl.querySelector('[data-trim-range]');
  const previewImg = editorEl.querySelector('[data-trim-preview-img]');
  const previewTime = editorEl.querySelector('[data-trim-preview-time]');
  const inLabel = editorEl.querySelector('[data-trim-in-label]');
  const outLabel = editorEl.querySelector('[data-trim-out-label]');
  const lenLabel = editorEl.querySelector('[data-trim-len-label]');

  // Reset button reuses handleAction wiring
  editorEl.querySelector('[data-action="trim-clear"]').addEventListener('click', () => {
    job.trimStart = '';
    job.trimEnd = '';
    job.trimExpanded = false;
    renderJobs();
  });

  // Preview in default player
  const playBtn = editorEl.querySelector('[data-trim-play-btn]');
  if (playBtn) {
    playBtn.addEventListener('click', async () => {
      try {
        await invoke('open_with_default_app', { path: job.inputPath });
        dlog('event', `Opened in default player: ${job.filename}`);
      } catch (e) {
        dlog('error', `Open in player failed: ${e}`);
        toast('Open failed', String(e), 'error');
      }
    });
  }

  // Inline video preview - generate a webview-playable MP4 in the background,
  // then swap the preview pane to a <video> element with native scrub support.
  const previewPane = editorEl.querySelector('[data-trim-preview-pane]');
  const previewStatus = editorEl.querySelector('[data-trim-preview-status]');
  const previewControls = editorEl.querySelector('[data-trim-preview-controls]');
  let previewVideoEl = null;

  (async () => {
    if (!previewPane) return;
    const t0 = performance.now();
    try {
      dlog('info', `Generating webview preview MP4 for ${job.filename}...`);
      const result = await invoke('generate_preview_video', { inputPath: job.inputPath });
      const path = result && (result.path || result.Path);
      if (!path) throw new Error('No preview path returned');
      dlog('info', `Preview MP4 ready in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${path}`);
      const bytes = await invoke('read_file_bytes', { path });
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const blob = new Blob([arr], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      previewVideoEl = document.createElement('video');
      previewVideoEl.className = 'dl-trim-preview-video';
      previewVideoEl.preload = 'auto';
      previewVideoEl.muted = true;
      previewVideoEl.playsInline = true;
      previewVideoEl.src = url;
      // Replace static image with the video
      const imgEl = previewPane.querySelector('[data-trim-preview-img]');
      if (imgEl) imgEl.remove();
      previewPane.insertBefore(previewVideoEl, previewStatus);
      previewStatus.textContent = 'Ready';
      previewStatus.classList.add('ready');
      setTimeout(() => previewStatus.style.display = 'none', 1500);
      previewControls.style.display = '';
      const playhead = editorEl.querySelector('[data-trim-playhead]');
      let playheadRaf = null;
      const updatePlayhead = () => {
        if (!previewVideoEl || !playhead) return;
        const pct = (previewVideoEl.currentTime / duration) * 100;
        playhead.style.left = pct + '%';
        if (!previewVideoEl.paused && !previewVideoEl.ended) {
          playheadRaf = requestAnimationFrame(updatePlayhead);
        }
      };
      previewVideoEl.addEventListener('loadedmetadata', () => {
        previewVideoEl.currentTime = startSec;
        if (playhead) {
          playhead.style.left = ((startSec / duration) * 100) + '%';
        }
      });
      previewVideoEl.addEventListener('play', () => {
        previewControls.querySelector('[data-trim-play]').disabled = true;
        previewControls.querySelector('[data-trim-pause]').disabled = false;
        if (playhead) playhead.classList.add('active');
        if (playheadRaf) cancelAnimationFrame(playheadRaf);
        playheadRaf = requestAnimationFrame(updatePlayhead);
      });
      previewVideoEl.addEventListener('pause', () => {
        previewControls.querySelector('[data-trim-play]').disabled = false;
        previewControls.querySelector('[data-trim-pause]').disabled = true;
        if (playheadRaf) { cancelAnimationFrame(playheadRaf); playheadRaf = null; }
        if (playhead) playhead.classList.remove('active');
      });
      previewVideoEl.addEventListener('seeked', () => {
        if (playhead) {
          const pct = (previewVideoEl.currentTime / duration) * 100;
          playhead.style.left = pct + '%';
        }
      });
      previewControls.querySelector('[data-trim-play]').addEventListener('click', () => {
        previewVideoEl.play().catch(() => {});
      });
      previewControls.querySelector('[data-trim-pause]').addEventListener('click', () => {
        previewVideoEl.pause();
      });
      previewControls.querySelector('[data-trim-play-range]').addEventListener('click', () => {
        previewVideoEl.currentTime = startSec;
        previewVideoEl.play().catch(() => {});
        const stopAt = () => {
          if (previewVideoEl.currentTime >= endSec) {
            previewVideoEl.pause();
            previewVideoEl.removeEventListener('timeupdate', stopAt);
          }
        };
        previewVideoEl.addEventListener('timeupdate', stopAt);
      });
    } catch (e) {
      dlog('warn', `Inline video preview unavailable: ${e}`);
      if (previewStatus) {
        previewStatus.textContent = 'Inline preview unavailable';
        previewStatus.style.background = 'rgba(239,68,68,0.7)';
      }
    }
  })();

  // Scrub state for this editor instance
  let scrubInFlight = false;
  let scrubPendingTime = null;
  let scrubLatestId = 0;
  const exactFrameCache = new Map(); // time-rounded -> data URL

  function snapPreviewToNearest(t) {
    const slots = editorEl.querySelectorAll('[data-trim-thumb].loaded');
    if (slots.length === 0) return false;
    const idx = Math.min(slots.length - 1, Math.max(0, Math.round((t / duration) * (THUMB_COUNT - 1))));
    let best = slots[0];
    let bestDiff = Infinity;
    slots.forEach(s => {
      const si = parseInt(s.dataset.index, 10);
      const d = Math.abs(si - idx);
      if (d < bestDiff) { bestDiff = d; best = s; }
    });
    const imgEl = editorEl.querySelector('[data-trim-preview-img]');
    if (imgEl) imgEl.style.backgroundImage = best.style.backgroundImage;
    return true;
  }

  async function fetchExactFrame(t) {
    // Round to 0.05s bins so a wiggle within ~50ms reuses the same cached frame
    // instead of re-spawning ffmpeg. Visually indistinguishable, much smoother.
    const key = (Math.round(t * 20) / 20).toFixed(2);
    if (exactFrameCache.has(key)) return exactFrameCache.get(key);
    const dataUrl = await invoke('extract_single_frame', {
      inputPath: job.inputPath,
      timeSeconds: t,
    });
    exactFrameCache.set(key, dataUrl);
    if (exactFrameCache.size > 1000) {
      // simple LRU-ish: drop the oldest-inserted entry
      const firstKey = exactFrameCache.keys().next().value;
      exactFrameCache.delete(firstKey);
    }
    return dataUrl;
  }

  async function setPreviewToTime(t) {
    previewTime.textContent = formatTimestamp(t);

    // If the inline video is ready, seek it - native, frame-accurate, instant.
    if (previewVideoEl && previewVideoEl.readyState >= 1) {
      try { previewVideoEl.currentTime = Math.max(0, Math.min(duration, t)); } catch {}
      return;
    }

    // Otherwise fall back to the two-stage thumbnail flow.
    snapPreviewToNearest(t);
    if (scrubInFlight) {
      scrubPendingTime = t;
      return;
    }
    scrubInFlight = true;
    const myId = ++scrubLatestId;
    try {
      const dataUrl = await fetchExactFrame(t);
      if (myId === scrubLatestId && dataUrl) {
        const imgEl = editorEl.querySelector('[data-trim-preview-img]');
        if (imgEl) imgEl.style.backgroundImage = `url("${dataUrl}")`;
      }
    } catch (e) {
      // silent
    } finally {
      scrubInFlight = false;
      if (scrubPendingTime != null && scrubPendingTime !== t) {
        const next = scrubPendingTime;
        scrubPendingTime = null;
        setPreviewToTime(next);
      } else {
        scrubPendingTime = null;
      }
    }
  }

  function paint() {
    const startPct = (startSec / duration) * 100;
    const endPct = (endSec / duration) * 100;
    handleIn.style.left = startPct + '%';
    handleOut.style.left = endPct + '%';
    maskLeft.style.width = startPct + '%';
    maskRight.style.width = (100 - endPct) + '%';
    rangeBand.style.left = startPct + '%';
    rangeBand.style.width = (endPct - startPct) + '%';
    inLabel.textContent = formatTimestamp(startSec);
    outLabel.textContent = formatTimestamp(endSec);
    lenLabel.textContent = formatTimestamp(endSec - startSec);
  }

  function commit() {
    // Only persist if user actually changed something (not full range)
    job.trimStart = startSec > 0.01 ? formatTimestamp(startSec) : '';
    job.trimEnd = endSec < duration - 0.01 ? formatTimestamp(endSec) : '';
    // Update toggle button label in the row above without full re-render
    const trimToggle = editorEl.parentElement.querySelector('[data-action="trim-toggle"]');
    if (trimToggle) {
      const trimOn = !!(job.trimStart || job.trimEnd);
      trimToggle.classList.toggle('on', trimOn);
      trimToggle.textContent = trimOn
        ? `Trim ${job.trimStart || '0'} - ${job.trimEnd || 'end'}`
        : '+ Trim';
    }
  }

  function startDrag(which, ev) {
    ev.preventDefault();
    const handle = which === 'in' ? handleIn : handleOut;
    handle.classList.add('dragging');
    const rect = timeline.getBoundingClientRect();
    const onMove = (e) => {
      const x = (e.clientX != null ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX)) || 0;
      let pct = (x - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      const t = pct * duration;
      if (which === 'in') {
        startSec = Math.min(t, endSec - 0.1);
        setPreviewToTime(startSec);
      } else {
        endSec = Math.max(t, startSec + 0.1);
        setPreviewToTime(endSec);
      }
      paint();
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      commit();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  handleIn.addEventListener('pointerdown', (e) => startDrag('in', e));
  handleOut.addEventListener('pointerdown', (e) => startDrag('out', e));

  // Click on the timeline outside the handles moves the nearest handle
  timeline.addEventListener('pointerdown', (e) => {
    if (e.target === handleIn || e.target === handleOut) return;
    if (e.target.closest('[data-trim-handle]')) return;
    const rect = timeline.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const t = pct * duration;
    const distIn = Math.abs(t - startSec);
    const distOut = Math.abs(t - endSec);
    if (distIn <= distOut) {
      startSec = Math.min(t, endSec - 0.1);
      setPreviewToTime(startSec);
    } else {
      endSec = Math.max(t, startSec + 0.1);
      setPreviewToTime(endSec);
    }
    paint();
    commit();
  });

  setPreviewToTime(startSec);
  paint();
}

function formatTimestamp(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60);
  const sStr = (s < 10 ? '0' : '') + s.toFixed(s >= 10 ? 1 : 2).replace(/\.?0+$/, '');
  const mStr = (h > 0 ? (m < 10 ? '0' : '') + m : '' + m);
  return h > 0 ? `${h}:${mStr}:${sStr}` : `${mStr}:${sStr}`;
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
    scheduleEstimates();
  } else if (action === 'trim-end') {
    job.trimEnd = (value || '').trim();
    scheduleEstimates();
  } else if (action === 'trim-clear') {
    job.trimStart = '';
    job.trimEnd = '';
    job.trimExpanded = false;
    renderJobs();
    scheduleEstimates();
  }
}

function updateFooter() {
  const running = jobs.filter(j => j.status === 'Running').length;
  const queued = jobs.filter(j => j.status === 'Queued').length;
  const completed = jobs.filter(j => j.status === 'Completed').length;
  footerActive.textContent = t('footer.running', { n: running }) + (queued > 0 ? ' / ' + t('footer.queued', { n: queued }) : '');
  footerCompleted.textContent = t('footer.completed', { n: completed });
  const totalIn = jobs.reduce((a, j) => a + (j.status === 'Completed' ? j.inputSize : 0), 0);
  const totalOut = jobs.reduce((a, j) => a + (j.status === 'Completed' ? j.outputSize : 0), 0);
  if (totalIn > 0 && totalOut > 0) {
    const saved = totalIn - totalOut;
    footerSaved.textContent = t(saved >= 0 ? 'footer.saved' : 'footer.added', { size: fmtBytes(Math.abs(saved)) });
  } else {
    // Nothing converted yet, so show what the queue is predicted to weigh instead.
    // Only jobs still waiting to run - a failed or cancelled job produces nothing.
    const estTotal = jobs.reduce(
      (a, j) => a + (j.status === 'Pending' ? (j.estimateBytes || 0) : 0),
      0
    );
    footerSaved.textContent = estTotal > 0 ? t('est.total', { size: fmtBytes(estTotal) }) : '';
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
    ffmpegStatus.appendChild(document.createTextNode(t('status.ffmpegOk')));
    info.appendChild(document.createTextNode(t('status.ffmpegOk') + '.'));
    dlog('info', 'FFmpeg detected on PATH');
    if (!silent) toast('FFmpeg detected', 'ffmpeg and ffprobe are reachable.', 'success', 3000);
  } else {
    ffmpegStatus.className = 'ffmpeg-status missing';
    ffmpegStatus.appendChild(document.createTextNode(t('status.ffmpegMissingPrefix')));
    ffmpegStatus.appendChild(makeFfmpegLink(t('install.link')));
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

  // Applying a preset resets the whole video pipeline, including Fit to size and
  // Vertical. Those two persist independently, so put the saved values back afterwards
  // or every launch would silently discard them. onFormChange below then drops the
  // dropdown to Custom if they no longer match the preset.
  targetSizeMbInput.value = String(parseInt(localStorage.getItem('fr_targetSizeMb') || '0', 10));
  verticalModeSelect.value = localStorage.getItem('fr_verticalMode') || 'off';

  refreshToggles();
  onFormChange();
  setupDragDrop();
}

// Watch folders
const WATCH_KEY = 'fr_watch_folders_v1';
const WATCH_POLL_MS = 3000;
// per-folder state: { id -> { seen: Map<path, {size, stable}> } }
const watchRuntime = new Map();

function loadWatchFolders() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); }
  catch { return []; }
}
function saveWatchFolders(list) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(list));
}

function refreshWatchPresetSelect() {
  const sel = $('#watchPresetSelect');
  if (!sel) return;
  const current = sel.value;
  const custom = loadCustomPresets();
  const builtinNames = Object.keys(BUILTIN_PRESETS).sort((a, b) => a.localeCompare(b));
  const customNames = Object.keys(custom).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '';
  const gb = document.createElement('optgroup');
  gb.label = 'Built-in';
  for (const n of builtinNames) {
    const o = document.createElement('option');
    o.value = 'builtin:' + n;
    o.textContent = n;
    gb.appendChild(o);
  }
  sel.appendChild(gb);
  if (customNames.length) {
    const gc = document.createElement('optgroup');
    gc.label = 'My presets';
    for (const n of customNames) {
      const o = document.createElement('option');
      o.value = 'custom:' + n;
      o.textContent = n;
      gc.appendChild(o);
    }
    sel.appendChild(gc);
  }
  if (current) sel.value = current;
}

function renderWatchFolders() {
  const list = $('#watchFoldersList');
  const folders = loadWatchFolders();
  list.innerHTML = '';
  if (folders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'watch-folders-empty';
    empty.textContent = 'No watch folders yet. Add one below and any new media file dropped into it will be auto-converted.';
    list.appendChild(empty);
    return;
  }
  for (const f of folders) {
    const el = document.createElement('div');
    el.className = 'watch-folder-item';
    const presetLabel = f.preset.replace(/^(builtin|custom):/, '');
    el.innerHTML = `
      <div class="watch-folder-pulse" title="Watching"></div>
      <div class="watch-folder-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</div>
      <div class="watch-folder-preset">${escapeHtml(presetLabel)}</div>
      <button class="watch-folder-remove" data-id="${escapeHtml(f.id)}" title="Stop watching">&#10005;</button>
    `;
    el.querySelector('.watch-folder-remove').addEventListener('click', () => {
      const newList = loadWatchFolders().filter(x => x.id !== f.id);
      saveWatchFolders(newList);
      watchRuntime.delete(f.id);
      renderWatchFolders();
      dlog('event', `Stopped watching: ${f.path}`);
    });
    list.appendChild(el);
  }
}

$('#watchAddBtn').addEventListener('click', async () => {
  try {
    const folder = await dialog.open({ directory: true, multiple: false });
    if (typeof folder !== 'string') return;
    const preset = $('#watchPresetSelect').value;
    if (!preset) { toast('Pick a preset', 'Choose a preset before adding the folder.', 'warn'); return; }
    const existing = loadWatchFolders();
    if (existing.some(f => f.path.toLowerCase() === folder.toLowerCase())) {
      toast('Already watching', folder, 'warn'); return;
    }
    const item = { id: 'w-' + Math.random().toString(36).slice(2), path: folder, preset };
    existing.push(item);
    saveWatchFolders(existing);
    // Seed seen-set with current files so we do not re-queue existing content
    try {
      const initial = await invoke('list_media_files', { path: folder });
      const seen = new Map();
      for (const f of initial) seen.set(f.path, { size: f.size, stable: true });
      watchRuntime.set(item.id, { seen });
    } catch (e) {
      dlog('warn', `Initial scan failed for ${folder}: ${e}`);
      watchRuntime.set(item.id, { seen: new Map() });
    }
    renderWatchFolders();
    dlog('event', `Now watching: ${folder} -> ${preset}`);
    toast('Watching folder', folder, 'success', 2500);
  } catch (e) {
    dlog('error', `Add watch folder failed: ${e}`);
  }
});

async function pollWatchFolders() {
  const folders = loadWatchFolders();
  if (folders.length === 0) return;
  const savedPreset = settings.preset;
  const savedTarget = targetSizeMbInput.value;
  const savedVertical = verticalModeSelect.value;
  let triggered = false;
  for (const f of folders) {
    let files;
    try {
      files = await invoke('list_media_files', { path: f.path });
    } catch (e) {
      dlog('warn', `Watch scan failed for ${f.path}: ${e}`);
      continue;
    }
    let rt = watchRuntime.get(f.id);
    if (!rt) { rt = { seen: new Map() }; watchRuntime.set(f.id, rt); }
    const stillPresent = new Set();
    for (const file of files) {
      stillPresent.add(file.path);
      const prev = rt.seen.get(file.path);
      if (!prev) {
        rt.seen.set(file.path, { size: file.size, stable: false });
        continue;
      }
      if (prev.stable) continue;
      if (prev.size === file.size && file.size > 0) {
        rt.seen.set(file.path, { size: file.size, stable: true });
        // Trigger conversion
        applyPresetByKey(f.preset);
        triggered = true;
        await addFileToQueue(file.path);
        dlog('event', `Watch trigger: ${file.path} (${f.preset})`);
      } else {
        rt.seen.set(file.path, { size: file.size, stable: false });
      }
    }
    // Drop removed files from seen set
    for (const known of Array.from(rt.seen.keys())) {
      if (!stillPresent.has(known)) rt.seen.delete(known);
    }
  }
  if (triggered) {
    // Restore the user-selected preset and form values so the UI doesn't appear hijacked.
    if (savedPreset) {
      const dd = $('#presetDropdown');
      if (dd && [...dd.options].some(o => o.value === savedPreset)) {
        dd.value = savedPreset;
        applyPresetByKey(savedPreset);
      }
    }
    targetSizeMbInput.value = savedTarget;
    verticalModeSelect.value = savedVertical;
    // Assigning .value fires no change event, so the conflict states and the preset
    // selection would still reflect the preset's zeroed values without this.
    updateFormConflicts();
    // Auto-start the queued items
    try { document.getElementById('convertAllBtn').click(); } catch {}
  }
}

setInterval(() => { pollWatchFolders().catch(e => dlog('warn', `Watch poll error: ${e}`)); }, WATCH_POLL_MS);

init();
refreshWatchPresetSelect();
renderWatchFolders();
applyLanguage(currentLang);
