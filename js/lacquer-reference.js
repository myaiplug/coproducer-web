/* Lacquer desk add-on: REFERENCE MATCH. Drop a reference track and compare your mix's timbre (MFCC profile)
   and tonal balance (40-band mel energy, level-matched) against it. Uses mfcc-rust by wavey-ai (Apache-2.0)
   via js/vendor/wavey/mfcc (NoDAW wasm wrapper). Everything runs in this tab; nothing is uploaded. */
(function () {
  const here = document.currentScript && document.currentScript.src ? document.currentScript.src : document.baseURI;
  const modUrl = new URL("vendor/wavey/wavey-audio.js", here).href;
  let modPromise = null;
  const load = () => (modPromise = modPromise || import(modUrl).catch((e) => { modPromise = null; throw e; }));
  const q = (s) => document.querySelector(s);
  let mixBuffer = null, mixProfile = null, refProfile = null, refName = "", token = 0;

  const zoneWords = { Low: "low end (30–120 Hz)", "Low-mid": "low-mids (120–500 Hz)", Mid: "mids (500 Hz–2 kHz)", Presence: "presence (2–6 kHz)", Air: "air (6–11 kHz)" };
  const fmtDb = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + " dB";

  function drawCurve(canvas, cmp) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(600, Math.round(canvas.clientWidth * dpr)); canvas.height = Math.round(150 * dpr);
    const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, range = 9;
    g.clearRect(0, 0, W, H); g.fillStyle = "#07050a"; g.fillRect(0, 0, W, H);
    const lx = (f) => (Math.log(f / 30) / Math.log(11025 / 30)) * W, y = (db) => H / 2 - (Math.max(-range, Math.min(range, db)) / range) * (H / 2 - 10 * dpr);
    g.font = `${10 * dpr}px JetBrains Mono, monospace`; g.textBaseline = "top";
    for (const z of cmp.zones) { const x = lx(z.lo); g.strokeStyle = "rgba(232,76,255,.18)"; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.fillStyle = "rgba(183,168,180,.7)"; g.fillText(z.name.toUpperCase(), x + 4 * dpr, 4 * dpr); }
    g.strokeStyle = "rgba(246,239,232,.35)"; g.setLineDash([4 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(183,168,180,.6)"; g.textBaseline = "middle"; g.fillText("+" + range + " dB", W - 54 * dpr, 12 * dpr); g.fillText("−" + range + " dB", W - 54 * dpr, H - 12 * dpr); g.fillText("REF", W - 30 * dpr, y(0) - 8 * dpr);
    const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, "#d7ffb8"); grad.addColorStop(1, "#e84cff");
    g.strokeStyle = grad; g.lineWidth = 2.5 * dpr; g.beginPath();
    cmp.centers.forEach((f, i) => { const X = lx(f), Y = y(cmp.diff[i]); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.stroke();
  }

  async function render() {
    const mine = ++token;
    const result = q("#refResult"), note = q("#refNote");
    if (!mixBuffer || !refProfile) return;
    result.hidden = false; note.textContent = "Profiling your mix locally…";
    try {
      const w = await load();
      if (!mixProfile) mixProfile = await w.timbreProfile(mixBuffer);
      if (mine !== token) return;
      const cmp = w.compareTimbre(mixProfile, refProfile);
      q("#refMatch").textContent = cmp.match + "%";
      q("#refLabel").textContent = "timbre match · " + cmp.label + " to " + refName;
      drawCurve(q("#refCurve"), cmp);
      const zones = q("#refZones"); zones.innerHTML = "";
      for (const z of cmp.zones) {
        const s = document.createElement("span");
        const flat = Math.abs(z.db) < 1;
        s.className = "zone" + (flat ? " ok" : z.db > 0 ? " hot" : " cold");
        s.textContent = z.name + " " + (flat ? "≈ matched" : fmtDb(z.db));
        s.title = flat ? "Within ±1 dB of the reference" : (z.db > 0 ? "More " : "Less ") + zoneWords[z.name] + " than the reference";
        zones.appendChild(s);
      }
      const off = cmp.zones.filter((z) => Math.abs(z.db) >= 2).sort((a, b) => Math.abs(b.db) - Math.abs(a.db));
      note.textContent = (off.length
        ? "Biggest gaps: " + off.slice(0, 2).map((z) => (z.db > 0 ? "more " : "less ") + zoneWords[z.name] + " (" + fmtDb(z.db) + ")").join(", ") + " than the reference."
        : "Tonal balance sits within ±2 dB of the reference in every zone.") +
        " Level-matched, so loudness differences don't count. Curve = your mix minus the reference across 40 mel bands.";
      window.__lacquerReference = { match: cmp.match, label: cmp.label, distance: cmp.distance, zones: cmp.zones.map((z) => ({ name: z.name, db: +z.db.toFixed(2) })) };
    } catch (e) {
      console.warn("[lacquer] reference match unavailable", e);
      if (mine === token) note.textContent = "Reference match unavailable: " + (e && e.message ? e.message : e);
    }
  }

  async function onReference(file) {
    const note = q("#refNote"); q("#refResult").hidden = false; note.textContent = "Reading " + file.name + " locally…";
    refProfile = null; ++token;
    try {
      const w = await load();
      const ctx = new OfflineAudioContext(2, 1, 48000);
      const { buffer, via } = await w.decodeAudioFile(file, ctx);
      note.textContent = "Profiling the reference" + (via === "soundkit" ? " (decoded by soundkit)" : "") + "…";
      refProfile = await w.timbreProfile(buffer); refName = file.name.replace(/\.[^.]+$/, "");
      q("#refDropLabel").textContent = "REFERENCE · " + refName.toUpperCase();
      render();
    } catch (e) { console.warn("[lacquer] reference decode failed", e); note.textContent = "Could not read that reference: " + (e && e.message ? e.message : e); }
  }

  function setMix(buffer) {
    mixBuffer = buffer; mixProfile = null;
    const dock = q("#referenceDock"); if (!dock) return;
    dock.hidden = false;
    if (refProfile) render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const input = q("#refInput"), drop = q("#refDrop");
    if (!input || !drop) return;
    input.addEventListener("change", (e) => e.target.files[0] && onReference(e.target.files[0]));
    drop.addEventListener("dragover", (e) => e.preventDefault());
    drop.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) onReference(e.dataTransfer.files[0]); });
    window.addEventListener("resize", () => { if (mixProfile && refProfile) render(); });
  });

  window.LacquerReference = { setMix };
})();
