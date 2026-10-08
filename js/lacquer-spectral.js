/* Lacquer desk add-on: soundkit-wasm decode fallback + mel-spec spectral map with
   model-free vocal-activity markers. Uses soundkit / mel-spec by wavey-ai (MIT).
   Everything runs in this tab; nothing is uploaded. Loaded on demand. */
(function () {
  const here = document.currentScript && document.currentScript.src ? document.currentScript.src : document.baseURI;
  const modUrl = new URL("vendor/wavey/wavey-audio.js", here).href;
  let modPromise = null;
  const load = () => (modPromise = modPromise || import(modUrl).catch((e) => { modPromise = null; throw e; }));
  const q = (s) => document.querySelector(s);
  let token = 0;

  const fmt = (s) => { const t = Math.max(0, Math.round(s)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };

  async function decodeFallback(file, ctx) {
    const w = await load();
    const pcm = await w.decodeWithSoundkit(file);
    return { buffer: w.planarToAudioBuffer(pcm, ctx), format: pcm.format };
  }

  function sectionsFrom(segments, duration) {
    const out = []; let t = 0;
    for (const s of segments) {
      if (s.start - t >= 0.5) out.push({ start: t, end: s.start, vocal: false });
      out.push({ start: s.start, end: s.end, vocal: true }); t = s.end;
    }
    if (duration - t >= 0.5) out.push({ start: t, end: duration, vocal: false });
    return out;
  }

  async function analyze(buffer) {
    if (window.LacquerReference) window.LacquerReference.setMix(buffer); // reference match add-on (mfcc-rust)
    const mine = ++token;
    const dock = q("#spectralDock"); if (!dock) return;
    const canvas = q("#melMap"); const lane = q("#vadLane"); const list = q("#vadSections"); const note = q("#spectralNote");
    dock.hidden = false; lane.innerHTML = ""; list.innerHTML = ""; note.textContent = "Mapping the spectrum locally…";
    try {
      const w = await load();
      const mono = w.toMono(buffer);
      const mel = await w.computeMel(mono, buffer.sampleRate);
      if (mine !== token) return;
      canvas.width = Math.max(600, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
      w.drawMel(canvas, mel, { stops: [[7, 5, 10], [45, 12, 70], [120, 30, 150], [232, 76, 255], [255, 190, 240], [255, 250, 245]] });
      const vad = await w.detectVoiceActivity(mono, buffer.sampleRate);
      if (mine !== token) return;
      const dur = buffer.duration;
      for (const s of vad.segments) {
        const band = document.createElement("i");
        band.style.left = (s.start / dur * 100) + "%"; band.style.width = Math.max(0.3, (s.end - s.start) / dur * 100) + "%";
        lane.appendChild(band);
      }
      const sections = sectionsFrom(vad.segments, dur);
      list.innerHTML = "";
      for (const s of sections) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "ghost sec" + (s.vocal ? " on" : "");
        b.textContent = fmt(s.start) + "–" + fmt(s.end) + " · " + (s.vocal ? "vocal-like" : "no vocal");
        b.addEventListener("click", () => { const a = q("#preview"); if (a && a.src) { a.currentTime = Math.min(s.start, Math.max(0, (a.duration || dur) - 0.05)); } });
        list.appendChild(b);
      }
      const pct = Math.round(vad.activeRatio * 100);
      note.textContent = vad.activeRatio >= 0.9
        ? "Vocal-like activity across " + pct + "% of the track. On a dense full mix the model-free detector reads almost everything as active; drop a vocal stem or acapella for clean vocal / no-vocal markers."
        : "Vocal-like activity across " + pct + "% of the track · " + vad.segments.length + " vocal section" + (vad.segments.length === 1 ? "" : "s") + ". Click a marker to jump the preview there. Model-free VAD: most accurate on vocal stems.";
      window.__lacquerSpectral = { frames: mel.frames, mels: mel.mels, segments: vad.segments, activeRatio: vad.activeRatio };
    } catch (e) {
      console.warn("[lacquer] spectral map unavailable", e);
      if (mine === token) { dock.hidden = true; }
    }
  }

  window.LacquerSpectral = { decodeFallback, analyze };
})();
