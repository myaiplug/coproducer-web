/* Lacquer analyze desk. Server first, browser engine as fallback. */
const SERVERS = ["http://127.0.0.1:8788", "http://localhost:8788"];
const SNIPPET_SEC = 12;
const $ = (s) => document.querySelector(s);

const state = {
  file: null,
  buffer: null,
  report: null,
  source: "idle",
  url: null,
  fixedUrl: null,
  usedFix: false,
  email: localStorage.getItem("lacquer-email") || "",
};

function db(v) {
  return 20 * Math.log10(Math.max(v, 1e-8));
}

function measure(buffer, name) {
  const sr = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const a = buffer.getChannelData(0);
  const b = ch > 1 ? buffer.getChannelData(1) : a;
  let peak = 0, sum = 0, silent = 0, zc = 0, prev = 0;
  let side = 0, mid = 0, bright = 0;
  const step = Math.max(1, Math.floor(n / 250000));
  for (let i = 0; i < n; i += step) {
    const l = a[i] || 0, r = b[i] || 0;
    const m = (l + r) * 0.5;
    const s = (l - r) * 0.5;
    const x = Math.max(Math.abs(l), Math.abs(r));
    if (x > peak) peak = x;
    sum += m * m;
    mid += m * m;
    side += s * s;
    if (x < 0.001) silent++;
    if ((m >= 0) !== (prev >= 0)) zc++;
    prev = m;
    bright += Math.abs(m - prev) ;
  }
  const samples = Math.ceil(n / step);
  const rms = Math.sqrt(sum / samples);
  const width = mid > 0 ? Math.min(100, (side / mid) * 100) : 0;
  const zcr = zc / samples;
  const brightness = Math.round(80 + zcr * sr * 0.45);
  const crest = db(peak) - db(rms);
  const lufs = db(rms) - 0.691;
  const clips = peak >= 0.999 ? Math.round(samples * 0.002) : 0;
  let score = 100;
  if (lufs > -10) score -= 18;
  else if (lufs < -18) score -= 10;
  if (db(peak) > -1) score -= 16;
  if (clips) score -= 14;
  if (width > 80) score -= 8;
  if (crest < 6) score -= 8;
  score = Math.max(42, Math.min(98, score));
  return {
    name,
    engine: "lacquer-browser",
    sampleRate: sr,
    channels: ch,
    duration: +(buffer.duration.toFixed(2)),
    peakDb: +db(peak).toFixed(2),
    rmsDb: +db(rms).toFixed(2),
    lufs: +lufs.toFixed(2),
    crest: +crest.toFixed(2),
    width: +width.toFixed(1),
    brightness,
    silence: +((silent / samples) * 100).toFixed(1),
    zcr: +zcr.toFixed(4),
    clips,
    score,
    rating: score >= 88 ? "Release ready" : score >= 72 ? "Usable after a light fix" : "Needs a pass",
  };
}

async function tryServer(file) {
  for (const base of SERVERS) {
    try {
      const ping = await fetch(base + "/health", { method: "GET" });
      if (!ping.ok) continue;
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(base + "/analyze", { method: "POST", body });
      if (!res.ok) continue;
      const data = await res.json();
      return { ...data, engine: "server", source: base };
    } catch (_) {}
  }
  return null;
}

function setStatus(text, mode) {
  const el = $("#engineStatus");
  el.textContent = text;
  el.dataset.mode = mode || "idle";
}

function paint(report) {
  $("#meters").hidden = false;
  const map = {
    peak: report.peakDb + " dBFS",
    rms: report.rmsDb + " dBFS",
    lufs: report.lufs + " LUFS",
    crest: report.crest + " dB",
    width: report.width + "%",
    bright: report.brightness + " Hz",
    dur: report.duration + " s",
    sr: report.sampleRate + " Hz",
    ch: String(report.channels),
    silence: report.silence + "%",
    score: String(report.score),
    rating: report.rating,
  };
  Object.entries(map).forEach(([k, v]) => {
    const n = document.querySelector(`[data-m="${k}"]`);
    if (n) n.textContent = v;
  });
  $("#fixBtn").disabled = state.usedFix;
}

function bindPreview(buffer) {
  if (state.url) URL.revokeObjectURL(state.url);
  const wav = encodeWav(buffer);
  state.url = URL.createObjectURL(wav);
  const audio = $("#preview");
  audio.src = state.url;
  $("#previewDock").hidden = false;
  drawWave(buffer);
}

function drawWave(buffer) {
  const c = $("#wave");
  const x = c.getContext("2d");
  const w = c.width = c.clientWidth * 2;
  const h = c.height = 120;
  const data = buffer.getChannelData(0);
  const cols = 240;
  const per = Math.floor(data.length / cols) || 1;
  x.clearRect(0, 0, w, h);
  x.fillStyle = "#120a18";
  x.fillRect(0, 0, w, h);
  x.strokeStyle = "#e84cff";
  x.lineWidth = 2;
  x.beginPath();
  for (let i = 0; i < cols; i++) {
    let m = 0;
    const s = i * per;
    for (let j = 0; j < per; j += Math.max(1, per >> 6)) m = Math.max(m, Math.abs(data[s + j] || 0));
    const y = (1 - m) * (h * 0.46);
    const px = (i / cols) * w;
    x.moveTo(px, h / 2 - (h / 2 - y));
    x.lineTo(px, h / 2 + (h / 2 - y));
  }
  x.stroke();
}

async function onFile(file) {
  state.file = file;
  state.usedFix = false;
  setStatus("Reading " + file.name + "…", "run");
  const ctx = new AudioContext();
  const raw = await file.arrayBuffer();
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(raw.slice(0));
  } catch (err) {
    setStatus("Could not decode that file. Try WAV, MP3, or M4A.", "bad");
    return;
  }
  state.buffer = buffer;
  setStatus("Server engine first…", "run");
  const server = await tryServer(file);
  if (server) {
    state.report = { ...measure(buffer, file.name), ...server, engine: "server" };
    setStatus("Server analysis · " + (server.source || "8788"), "ok");
  } else {
    state.report = measure(buffer, file.name);
    state.report.engine = "lacquer-browser";
    setStatus("Server offline. Lacquer browser engine is the fallback. Nothing uploaded.", "fallback");
  }
  paint(state.report);
  bindPreview(buffer);
  $("#docs").hidden = !state.email;
  $("#gate").hidden = !!state.email;
}

function softFix(buffer) {
  const out = new AudioContext().createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    for (let i = 0; i < src.length; i++) peak = Math.max(peak, Math.abs(src[i]));
  }
  const target = Math.pow(10, -1 / 20);
  const gain = peak > 0 ? Math.min(1.4, target / peak) : 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    let prev = 0;
    for (let i = 0; i < src.length; i++) {
      let x = src[i] * gain;
      x = Math.tanh(x * 1.15) * 0.9;
      x = x - prev * 0.04;
      prev = x;
      dst[i] = x;
    }
  }
  return out;
}

function sliceBuffer(buffer, seconds) {
  const n = Math.min(buffer.length, Math.floor(seconds * buffer.sampleRate));
  const out = new AudioContext().createBuffer(buffer.numberOfChannels, n, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(buffer.getChannelData(c).subarray(0, n));
  }
  return out;
}

function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const ab = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + len * ch * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, len * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const x = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function reportHtml(r) {
  return `<!doctype html><meta charset="utf-8"><title>Lacquer report · ${r.name}</title>
  <body style="background:#10080f;color:#f6efe8;font-family:Georgia,serif;padding:40px">
  <p style="letter-spacing:.28em;font-size:11px">LACQUER · COPRODUCER</p>
  <h1>${r.name}</h1>
  <p>Score ${r.score} · ${r.rating}</p>
  <p>Engine ${r.engine}. LUFS ${r.lufs}. Peak ${r.peakDb} dBFS. Crest ${r.crest} dB. Width ${r.width}%.</p>
  <pre>${JSON.stringify(r, null, 2)}</pre></body>`;
}

function reportTxt(r) {
  return [
    "LACQUER / COPRODUCER ANALYSIS",
    r.name,
    "Engine: " + r.engine,
    "Score: " + r.score + "  " + r.rating,
    "LUFS: " + r.lufs,
    "Peak dBFS: " + r.peakDb,
    "RMS dBFS: " + r.rmsDb,
    "Crest dB: " + r.crest,
    "Width %: " + r.width,
    "Brightness Hz: " + r.brightness,
    "Silence %: " + r.silence,
    "Duration s: " + r.duration,
    "Sample rate: " + r.sampleRate,
    "Channels: " + r.channels,
    "Signed to: " + state.email,
  ].join("\n");
}

$("#fileInput").addEventListener("change", (e) => e.target.files[0] && onFile(e.target.files[0]));
["dragover", "drop"].forEach((ev) => {
  $("#dropzone").addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "drop" && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  });
});

$("#playBtn").addEventListener("click", () => {
  const a = $("#preview");
  if (a.paused) a.play(); else a.pause();
  $("#playBtn").textContent = a.paused ? "Play preview" : "Pause";
});
$("#preview").addEventListener("pause", () => { $("#playBtn").textContent = "Play preview"; });
$("#preview").addEventListener("play", () => { $("#playBtn").textContent = "Pause"; });

$("#fixBtn").addEventListener("click", () => {
  if (!state.buffer || state.usedFix) return;
  state.usedFix = true;
  $("#fixBtn").disabled = true;
  $("#fixBtn").textContent = "Snippet rendered";
  const fixed = softFix(state.buffer);
  const snip = sliceBuffer(fixed, SNIPPET_SEC);
  download(encodeWav(snip), "lacquer-autofix-snippet.wav");
  setStatus("One-time auto fix delivered as a " + SNIPPET_SEC + "s snippet. Sign in for the full pass and the documents.", "ok");
});

function unlock(email) {
  state.email = email;
  localStorage.setItem("lacquer-email", email);
  $("#gate").hidden = true;
  $("#docs").hidden = false;
  $("#who").textContent = email;
}

$("#emailForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("#email").value.trim();
  if (!email.includes("@")) return;
  unlock(email);
});

$("#dlHtml").addEventListener("click", () => {
  if (!state.email || !state.report) return;
  download(new Blob([reportHtml(state.report)], { type: "text/html" }), "lacquer-analysis.html");
});
$("#dlJson").addEventListener("click", () => {
  if (!state.email || !state.report) return;
  download(new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" }), "lacquer-analysis.json");
});
$("#dlTxt").addEventListener("click", () => {
  if (!state.email || !state.report) return;
  download(new Blob([reportTxt(state.report)], { type: "text/plain" }), "lacquer-analysis.txt");
});
$("#dlFull").addEventListener("click", () => {
  if (!state.email || !state.buffer) return;
  download(encodeWav(softFix(state.buffer)), "lacquer-autofix-full.wav");
});

if (state.email) unlock(state.email);
setStatus("Server first. If 127.0.0.1:8788 is dark, the Lacquer browser engine takes the pass.", "idle");
