/* Lacquer desk. CoProducer gates, honest grade, conservative repair, A/B. */
const SERVERS = ["http://127.0.0.1:8788", "http://localhost:8788"];
const $ = (s) => document.querySelector(s);
const state = {
  file: null, before: null, after: null, report: null, fixed: null,
  side: "A", email: localStorage.getItem("lacquer-email") || "",
  actions: [],
};

const db = (v) => 20 * Math.log10(Math.max(Math.abs(v), 1e-9));

function grade(m) {
  const notes = [];
  let score = 100;
  if (m.clips > 0) {
    const d = Math.min(22, 8 + Math.log10(m.clips + 1) * 4);
    score -= d;
    notes.push(m.clips + " samples at or above full scale. Transients already flattened are not rebuilt.");
  }
  if (m.truePeak > -1) {
    score -= Math.min(16, (m.truePeak + 1) * 5);
    notes.push("True peak " + m.truePeak.toFixed(2) + " dBTP is over the -1.0 ceiling.");
  }
  const off = Math.abs(m.lufs + 14);
  if (off > 1.5) {
    score -= Math.min(28, (off - 1.5) * 4);
    notes.push("Integrated loudness " + m.lufs.toFixed(2) + " LUFS is " + off.toFixed(2) + " LU from -14. Release-ready needs to be inside 1.5 LU.");
  }
  if (m.phase < 0.2) {
    score -= 12;
    notes.push("Phase correlation " + m.phase.toFixed(2) + " is under 0.2. This pass will not fix phase.");
  }
  if (m.sampleRate < 44100) {
    score -= 10;
    notes.push("Sample rate " + m.sampleRate + " Hz is under 44.1 kHz.");
  }
  if (m.crest < 5.5) {
    score -= 6;
    notes.push("Crest " + m.crest.toFixed(1) + " dB is already crushed. Limiting will not open it back up.");
  }
  const gates = m.clips === 0 && m.truePeak <= -1 && off <= 1.5 && m.phase >= 0.2 && m.sampleRate >= 44100;
  score = Math.round(Math.max(38, Math.min(99, score)));
  if (gates) score = Math.max(score, 90);
  else score = Math.min(score, 89);
  const rating = gates && score >= 90 ? "Release ready" : score >= 75 ? "Usable after technical corrections" : "Needs a pass";
  return { score, rating, notes, gates };
}

function measure(buffer, name) {
  const sr = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const L = buffer.getChannelData(0);
  const R = ch > 1 ? buffer.getChannelData(1) : L;
  let peak = 0, clips = 0, sum = 0, num = 0, eL = 0, eR = 0, tp = 0;
  const block = Math.max(1, Math.floor(sr * 0.4));
  const powers = [];
  let acc = 0, accN = 0;
  const step = n > 1500000 ? 2 : 1;
  for (let i = 0; i < n; i += step) {
    const l = L[i], r = R[i];
    const al = Math.abs(l), ar = Math.abs(r);
    const p = Math.max(al, ar);
    if (p > peak) peak = p;
    if (al >= 0.999 || ar >= 0.999) clips += step;
    sum += l * l + r * r;
    num += l * r; eL += l * l; eR += r * r;
    acc += (l * l + r * r) * 0.5;
    accN++;
    if (accN * step >= block) {
      powers.push(acc / accN);
      acc = 0; accN = 0;
    }
    if (i + step < n) {
      const t = 0.5;
      tp = Math.max(tp, Math.abs(l + (L[i + step] - l) * t), Math.abs(r + (R[Math.min(i + step, n - 1)] - r) * t));
    }
  }
  tp = Math.max(tp, peak);
  const live = powers.filter((p) => p > 1e-8);
  const mean = live.reduce((s, p) => s + p, 0) / (live.length || 1);
  const rel = mean * Math.pow(10, -1);
  const gated = live.filter((p) => p >= rel);
  const g = gated.reduce((s, p) => s + p, 0) / (gated.length || 1);
  const lufs = -0.691 + 10 * Math.log10(g + 1e-12);
  const rms = Math.sqrt(sum / (n / step) / ch);
  const peakDb = db(peak);
  const phase = eL > 0 && eR > 0 ? num / Math.sqrt(eL * eR) : 1;
  const m = {
    name, sampleRate: sr, channels: ch,
    duration: +buffer.duration.toFixed(2),
    peakDb: +peakDb.toFixed(2),
    truePeak: +db(tp).toFixed(2),
    rmsDb: +db(rms).toFixed(2),
    lufs: +lufs.toFixed(2),
    crest: +(peakDb - db(rms)).toFixed(2),
    phase: +phase.toFixed(3),
    clips, width: +((1 - Math.max(-1, Math.min(1, phase))) * 50).toFixed(1),
  };
  return Object.assign(m, grade(m));
}

function highpass(buffer) {
  const sr = buffer.sampleRate;
  const a = Math.exp(-2 * Math.PI * 25 / sr);
  const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    let x1 = 0, y1 = 0;
    for (let i = 0; i < src.length; i++) {
      const y = a * (y1 + src[i] - x1);
      x1 = src[i]; y1 = y; dst[i] = y;
    }
  }
  return out;
}

function gainAndLimit(buffer, gainDb) {
  const g = Math.pow(10, gainDb / 20);
  const ceil = Math.pow(10, -1 / 20);
  const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) {
      let x = src[i] * g;
      if (x > ceil) x = ceil;
      else if (x < -ceil) x = -ceil;
      dst[i] = x;
    }
  }
  return out;
}

function repair(buffer, before) {
  const actions = ["25 Hz high-pass. Sub rumble under the kick is cut. The musical low end stays."];
  let buf = highpass(buffer);
  const afterHp = measure(buf, before.name);
  let gainDb = Math.max(-6, Math.min(6, -14 - afterHp.lufs));
  if (Math.abs(gainDb) >= 0.4) {
    actions.push("Loudness trim " + (gainDb > 0 ? "+" : "") + gainDb.toFixed(1) + " dB toward -14 LUFS. Capped at 6 dB so a quiet verse is not invented into a master.");
  } else {
    gainDb = 0;
    actions.push("Loudness already inside the window. No loudnorm gain.");
  }
  const projectedTp = afterHp.truePeak + gainDb;
  if (projectedTp > -1 || afterHp.clips > 0) {
    actions.push("True-peak ceiling at -1.0 dBTP. Already-flat clipped samples are not rebuilt. This only stops new overs.");
  } else {
    actions.push("After the trim, true peak sits under -1.0 dBTP. The ceiling did not have to grab.");
  }
  if (before.phase < 0.2) actions.push("Phase left alone. Correlation under 0.2 is a mix problem, not a limiter problem.");
  buf = gainAndLimit(buf, gainDb);
  return { buffer: buf, actions, gainDb };
}

function paint(report, label) {
  $("#meters").hidden = false;
  $("#grade").hidden = false;
  $("#scoreNum").textContent = report.score;
  $("#scoreWord").textContent = report.rating;
  $("#scoreWhy").textContent = report.notes.length ? report.notes.join(" ") : "All published gates pass: clips 0, true peak at or under -1.0, loudness within 1.5 LU of -14, phase at least 0.2, rate at least 44.1 kHz.";
  const map = {
    lufs: report.lufs + " LUFS", peak: report.peakDb + " dBFS", tp: report.truePeak + " dBTP",
    crest: report.crest + " dB", phase: String(report.phase), clips: String(report.clips),
    sr: report.sampleRate + " Hz", ch: String(report.channels), dur: report.duration + " s",
  };
  Object.entries(map).forEach(([k, v]) => {
    const n = document.querySelector(`[data-m="${k}"]`);
    if (n) n.textContent = v;
  });
  $("#sideLabel").textContent = label;
}

function row(metric, a, b) {
  const d = (typeof b === "number" && typeof a === "number") ? (b - a) : "";
  const good = metric === "Clips" || metric === "True peak" || metric === "Peak" ? b < a : metric === "Score" ? b > a : Math.abs(b - a) < 0.05 || metric === "Phase";
  return `<tr><td>${metric}</td><td>${a}</td><td>${b}</td><td class="${good ? "up" : ""}">${typeof d === "number" ? (d > 0 ? "+" : "") + d.toFixed(2) : ""}</td></tr>`;
}

function showDelta(before, after, actions) {
  $("#delta").hidden = false;
  $("#deltaBody").innerHTML = [
    row("Score", before.score, after.score),
    row("LUFS", before.lufs, after.lufs),
    row("True peak", before.truePeak, after.truePeak),
    row("Peak", before.peakDb, after.peakDb),
    row("Crest", before.crest, after.crest),
    row("Phase", before.phase, after.phase),
    row("Clips", before.clips, after.clips),
  ].join("");
  $("#fixedList").innerHTML = actions.map((a) => `<li>${a}</li>`).join("");
}

function drawWave(buffer) {
  const c = $("#wave");
  if (!c) return;
  const x = c.getContext("2d");
  const w = c.width = Math.max(300, c.clientWidth * 2);
  const h = c.height = 120;
  const data = buffer.getChannelData(0);
  const cols = 180;
  const per = Math.floor(data.length / cols) || 1;
  x.clearRect(0, 0, w, h);
  x.strokeStyle = "#e84cff";
  x.beginPath();
  for (let i = 0; i < cols; i++) {
    let m = 0;
    const s = i * per;
    for (let j = 0; j < per; j += Math.max(1, per >> 5)) m = Math.max(m, Math.abs(data[s + j] || 0));
    const px = (i / cols) * w;
    const amp = m * (h * 0.46);
    x.moveTo(px, h / 2 - amp);
    x.lineTo(px, h / 2 + amp);
  }
  x.stroke();
}
function bindAudio(buffer) {
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = URL.createObjectURL(encodeWav(buffer));
  const audio = $("#preview");
  const t = audio.currentTime || 0;
  const playing = !audio.paused;
  audio.src = state.url;
  audio.onloadedmetadata = () => {
    audio.currentTime = Math.min(t, Math.max(0, audio.duration - 0.05));
    if (playing) audio.play().catch(() => {});
  };
  drawWave(buffer);
}

async function tryServer(file) {
  for (const base of SERVERS) {
    try {
      const ping = await fetch(base + "/health");
      if (!ping.ok) continue;
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(base + "/analyze", { method: "POST", body });
      if (!res.ok) continue;
      const data = await res.json();
      return { data, source: base };
    } catch (_) {}
  }
  return null;
}

async function onFile(file) {
  state.file = file;
  state.after = null;
  $("#delta").hidden = true;
  $("#engineStatus").textContent = "Decoding " + file.name + "…";
  const ctx = new AudioContext();
  const raw = await file.arrayBuffer();
  let buffer;
  try { buffer = await ctx.decodeAudioData(raw.slice(0)); }
  catch (_) { $("#engineStatus").textContent = "Could not decode that file."; return; }
  state.beforeBuf = buffer;
  const local = measure(buffer, file.name);
  const server = await tryServer(file);
  state.before = local;
  if (server && server.data && server.data.score != null) {
    state.before.serverScore = server.data.score;
    state.before.engine = "server";
    $("#engineStatus").textContent = "Server answered at " + server.source + " with score " + server.data.score + ". The grade on this page is the Lacquer meter, so the number matches the specs.";
  } else {
    state.before.engine = "lacquer-browser";
    $("#engineStatus").textContent = "Server dark. Grade is the Lacquer meter against CoProducer gates. Nothing uploaded.";
  }
  paint(state.before, "A · original");
  bindAudio(buffer);
  $("#previewDock").hidden = false;
  state.side = "A";
}

$("#fileInput").addEventListener("change", (e) => e.target.files[0] && onFile(e.target.files[0]));
$("#dropzone").addEventListener("dragover", (e) => e.preventDefault());
$("#dropzone").addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });

$("#playBtn").addEventListener("click", () => {
  const a = $("#preview");
  if (!a.src) return;
  if (a.paused) a.play(); else a.pause();
  $("#playBtn").textContent = a.paused ? "Play" : "Pause";
});
$("#preview").addEventListener("pause", () => { $("#playBtn").textContent = "Play"; });
$("#preview").addEventListener("play", () => { $("#playBtn").textContent = "Pause"; });

function setSide(side) {
  if (!state.beforeBuf) return;
  state.side = side;
  const buf = side === "B" && state.afterBuf ? state.afterBuf : state.beforeBuf;
  const report = side === "B" && state.after ? state.after : state.before;
  bindAudio(buf);
  paint(report, side === "B" ? "B · fixed" : "A · original");
  $("#aBtn").classList.toggle("on", side === "A");
  $("#bBtn").classList.toggle("on", side === "B");
}
$("#aBtn").addEventListener("click", () => setSide("A"));
$("#bBtn").addEventListener("click", () => setSide("B"));

$("#fixBtn").addEventListener("click", () => {
  if (!state.beforeBuf || !state.before) return;
  const pass = repair(state.beforeBuf, state.before);
  state.afterBuf = pass.buffer;
  state.actions = pass.actions;
  state.after = measure(pass.buffer, state.before.name);
  state.after.engine = state.before.engine === "server" ? "server+lacquer-fix" : "lacquer-fix";
  showDelta(state.before, state.after, pass.actions);
  setSide("B");
  const snip = sliceBuffer(pass.buffer, 12);
  download(encodeWav(snip), "lacquer-fix-snippet.wav");
  $("#engineStatus").textContent = "Score reloaded on the fixed pass. A is the bounce. B is the repair. Snippet is 12 seconds. Full file and documents need email.";
});

function sliceBuffer(buffer, seconds) {
  const n = Math.min(buffer.length, Math.floor(seconds * buffer.sampleRate));
  const out = new AudioBuffer({ length: n, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) out.getChannelData(c).set(buffer.getChannelData(c).subarray(0, n));
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
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

function pack() {
  return { before: state.before, after: state.after, actions: state.actions, email: state.email, gates: "−14 LUFS ±1.5, true peak ≤ −1.0 dBTP, clips 0, rate ≥ 44.1 kHz, phase ≥ 0.2, release-ready ≥ 90" };
}
$("#dlHtml").addEventListener("click", () => download(new Blob([`<!doctype html><meta charset="utf-8"><title>Lacquer</title><pre>${JSON.stringify(pack(), null, 2)}</pre>`], { type: "text/html" }), "lacquer-analysis.html"));
$("#dlJson").addEventListener("click", () => download(new Blob([JSON.stringify(pack(), null, 2)], { type: "application/json" }), "lacquer-analysis.json"));
$("#dlTxt").addEventListener("click", () => {
  const b = state.before, a = state.after;
  const lines = ["LACQUER / COPRODUCER", b.name, "Before score " + b.score + " " + b.rating, a ? "After score " + a.score + " " + a.rating : "No fix yet", ...(state.actions || [])];
  download(new Blob([lines.join("\n")], { type: "text/plain" }), "lacquer-analysis.txt");
});
$("#dlFull").addEventListener("click", () => { if (state.afterBuf) download(encodeWav(state.afterBuf), "lacquer-fix-full.wav"); });

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
  if (email.includes("@")) unlock(email);
});
if (state.email) unlock(state.email);
$("#engineStatus").textContent = "Drop a bounce. Grade uses CoProducer gates. Server at 127.0.0.1:8788 wins if it answers.";
