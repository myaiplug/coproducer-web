// wavey-audio.js — NoDAW Labs glue around wavey-ai's soundkit-wasm and mel-spec (both MIT),
// flac (Apache-2.0) and mfcc-rust (Apache-2.0).
// Uses soundkit / mel-spec by wavey-ai (MIT) — https://github.com/wavey-ai
// Uses flac / mfcc-rust by wavey-ai (Apache-2.0) — https://github.com/wavey-ai/flac, https://github.com/wavey-ai/mfcc-rust
// All processing is local to the browser tab. Nothing is uploaded.
//
//   decodeAudioFile(file, audioContext)  -> { buffer, via: "browser" | "soundkit", format }
//       Browser decodeAudioData first (unchanged behaviour); soundkit-wasm only when it fails.
//   computeMel(samples, sampleRate, opts) -> { data, frames, mels, hopSeconds, min, max }
//   drawMel(canvas, mel, opts)
//   detectVoiceActivity(samples, sampleRate, opts) -> { segments: [{ start, end }], ... }
//   toMono(audioBuffer)
//   encodeFlac(audioBuffer, { bits: 16|24, level: 0|1|2, quantize }) -> Blob(audio/flac)  [wavey-ai/flac, lossless]
//   timbreProfile(audioBuffer) / compareTimbre(mine, ref)                          [wavey-ai/mfcc-rust]
//   Every WASM module loads only when its function is first called.

const BASE = new URL("./", import.meta.url);
let soundkitPromise = null;
let melPromise = null;

export function loadSoundkit() {
  if (!soundkitPromise) {
    soundkitPromise = (async () => {
      const mod = await import(new URL("soundkit/soundkit_wasm.js", BASE).href);
      await mod.default({ module_or_path: new URL("soundkit/soundkit_wasm_bg.wasm", BASE) });
      const runtime = await import(new URL("soundkit/streaming-media.mjs", BASE).href);
      return { sk: mod, runtime };
    })().catch((error) => { soundkitPromise = null; throw error; });
  }
  return soundkitPromise;
}

export function loadMelSpec() {
  if (!melPromise) {
    melPromise = (async () => {
      const mod = await import(new URL("mel-spec/mel_spec.js", BASE).href);
      await mod.default({ module_or_path: new URL("mel-spec/mel_spec_bg.wasm", BASE) });
      return mod;
    })().catch((error) => { melPromise = null; throw error; });
  }
  return melPromise;
}

let flacPromise = null;
let mfccPromise = null;

export function loadFlac() {
  if (!flacPromise) {
    flacPromise = (async () => {
      const mod = await import(new URL("flac/nodaw_flac_wasm.js", BASE).href);
      await mod.default({ module_or_path: new URL("flac/nodaw_flac_wasm_bg.wasm", BASE) });
      return mod;
    })().catch((error) => { flacPromise = null; throw error; });
  }
  return flacPromise;
}

export function loadMfcc() {
  if (!mfccPromise) {
    mfccPromise = (async () => {
      const mod = await import(new URL("mfcc/nodaw_mfcc_wasm.js", BASE).href);
      await mod.default({ module_or_path: new URL("mfcc/nodaw_mfcc_wasm_bg.wasm", BASE) });
      return mod;
    })().catch((error) => { mfccPromise = null; throw error; });
  }
  return mfccPromise;
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------- byte sources ----------
function cachedSource(blob, blockSize = 4 * 1024 * 1024) {
  let cacheStart = -1;
  let cache = null;
  async function block(start) {
    if (cacheStart !== start) {
      cache = new Uint8Array(await blob.slice(start, Math.min(blob.size, start + blockSize)).arrayBuffer());
      cacheStart = start;
    }
    return cache;
  }
  return {
    size: blob.size,
    async read(start, end) {
      end = Math.min(end, blob.size);
      if (end - start > blockSize / 2) return new Uint8Array(await blob.slice(start, end).arrayBuffer());
      const blockStart = Math.floor(start / blockSize) * blockSize;
      if (end <= blockStart + blockSize) {
        const data = await block(blockStart);
        return data.slice(start - blockStart, end - blockStart);
      }
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
}

// ---------- format sniffing ----------
function ascii(bytes, offset, length) {
  let out = "";
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

export function sniffFormat(head, name = "") {
  const riff = ascii(head, 0, 4);
  if ((riff === "RIFF" || riff === "RF64" || riff === "BW64") && ascii(head, 8, 4) === "WAVE") return "wav";
  if (riff === "FORM" && /^AIF[FC]$/.test(ascii(head, 8, 4))) return "aiff";
  if (riff === "fLaC") return "flac";
  if (riff === "caff") return "caf";
  if (riff === "OggS") return ascii(head, 0, 96).includes("OpusHead") ? "ogg-opus" : "ogg";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (ascii(head, 4, 4) === "ftyp" || ascii(head, 4, 4) === "moov" || ascii(head, 4, 4) === "wide" || ascii(head, 4, 4) === "mdat") return "mp4";
  if (ascii(head, 0, 3) === "ID3") return "mp3";
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return (head[1] & 0x06) === 0 ? "aac" : "mp3";
  const ext = (name.split(".").pop() || "").toLowerCase();
  const byExt = { wav: "wav", wave: "wav", aif: "aiff", aiff: "aiff", flac: "flac", mp3: "mp3", aac: "aac", m4a: "mp4", mp4: "mp4", mov: "mp4", m4v: "mp4", ogg: "ogg", oga: "ogg", opus: "ogg-opus", webm: "webm", mkv: "webm" };
  return byExt[ext] || "auto";
}

// Returns true when a WAV header declares IEEE float samples (format 3, or extensible with float GUID).
function wavIsFloat(head) {
  let offset = 12;
  while (offset + 8 <= head.length) {
    const id = ascii(head, offset, 4);
    const size = head[offset + 4] | (head[offset + 5] << 8) | (head[offset + 6] << 16) | (head[offset + 7] << 24);
    if (id === "fmt ") {
      const tag = head[offset + 8] | (head[offset + 9] << 8);
      if (tag === 3) return true;
      if (tag === 0xfffe && offset + 8 + 26 <= head.length) {
        const sub = head[offset + 8 + 24] | (head[offset + 8 + 25] << 8);
        return sub === 3;
      }
      return false;
    }
    offset += 8 + (size >>> 0) + ((size >>> 0) & 1);
  }
  return false;
}

// ---------- PCM accumulation ----------
class PlanarAccumulator {
  constructor() { this.chunks = []; this.channels = 0; this.sampleRate = 0; this.length = 0; }
  push(planes, sampleRate) {
    if (!planes.length || !planes[0].length) return;
    if (!this.channels) { this.channels = planes.length; this.sampleRate = sampleRate; }
    if (planes.length !== this.channels || sampleRate !== this.sampleRate) throw new Error("Stream changed channel layout or sample rate mid-file");
    this.chunks.push(planes);
    this.length += planes[0].length;
  }
  finish() {
    if (!this.length) throw new Error("No audio samples were decoded");
    const out = Array.from({ length: this.channels }, () => new Float32Array(this.length));
    let offset = 0;
    for (const planes of this.chunks) {
      for (let c = 0; c < this.channels; c += 1) out[c].set(planes[c], offset);
      offset += planes[0].length;
    }
    this.chunks = [];
    return { sampleRate: this.sampleRate, channels: out, length: this.length };
  }
}

function interleavedBytesToPlanar(bytes, channels, bits, isFloat) {
  const bytesPerSample = Math.ceil(bits / 8);
  const frames = Math.floor(bytes.byteLength / (bytesPerSample * channels));
  const planes = Array.from({ length: channels }, () => new Float32Array(frames));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      let v;
      if (bytesPerSample === 2) v = view.getInt16(p, true) / 32768;
      else if (bytesPerSample === 3) { let x = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16); if (x & 0x800000) x -= 0x1000000; v = x / 8388608; }
      else if (bytesPerSample === 4) v = isFloat ? view.getFloat32(p, true) : view.getInt32(p, true) / 2147483648;
      else if (bytesPerSample === 1) v = (bytes[p] - 128) / 128;
      else if (bytesPerSample === 8) v = view.getFloat64(p, true);
      else v = 0;
      planes[c][i] = v;
      p += bytesPerSample;
    }
  }
  return planes;
}

// Heuristic used only when a 32-bit stream's sample type is not declared by the container.
function looksLikeFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.min(4096, Math.floor(bytes.byteLength / 4));
  let nonZero = 0;
  for (let i = 0; i < n; i += 1) {
    const f = view.getFloat32(i * 4, true);
    if (!Number.isFinite(f) || Math.abs(f) > 8) return false;
    if (f !== 0) nonZero += 1;
  }
  return nonZero > 0;
}

async function decodeSequential(sk, file, format, head, onProgress) {
  const decoder = format === "auto" ? sk.Decoder.newAuto() : sk.Decoder.newWithFormat(format);
  const acc = new PlanarAccumulator();
  let isFloat = format === "wav" ? wavIsFloat(head) : null;
  const handle = (frames) => {
    for (const frame of frames) {
      if (isFloat === null && frame.bitsPerSample === 32) isFloat = looksLikeFloat32(frame.data);
      acc.push(interleavedBytesToPlanar(frame.data, frame.channels, frame.bitsPerSample, !!isFloat), frame.sampleRate);
    }
  };
  const CHUNK = 1024 * 1024; // soundkit accepts <= 4 MiB per push
  try {
    for (let offset = 0; offset < file.size; offset += CHUNK) {
      const bytes = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + CHUNK)).arrayBuffer());
      handle(decoder.push(bytes));
      onProgress?.(Math.min(1, (offset + CHUNK) / file.size));
      if ((offset / CHUNK) % 4 === 3) await yieldToUi();
    }
    handle(decoder.flush());
  } finally {
    try { decoder.free(); } catch { /* already drained */ }
  }
  return acc.finish();
}

async function decodeMp4(sk, runtime, file, onProgress) {
  const media = await runtime.openSeekableMp4(cachedSource(file), sk);
  const acc = new PlanarAccumulator();
  try {
    const track = media.tracks.find((t) => t.kind === "audio" && (t.codec === "aac" || t.codec === "alac"));
    if (!track) throw new Error(`No supported audio track (found: ${media.tracks.map((t) => `${t.kind}/${t.codec}`).join(", ") || "none"})`);
    let decoder;
    if (track.codec === "aac") decoder = new sk.WasmAacLcDecoder(track.decoderConfiguration);
    else decoder = new sk.WasmAlacPacketDecoder(track.codecPrivate);
    try {
      let n = 0;
      for await (const { sampleIndex, packet } of media.packets({ trackId: track.trackId })) {
        let planes; let rate;
        if (track.codec === "aac") { planes = Array.from(decoder.decodePlanar(packet.data)); rate = decoder.sampleRate; }
        else { const f = decoder.decode(packet.data); planes = interleavedBytesToPlanar(f.data, f.channels, f.bitsPerSample, false); rate = track.sampleRate || decoder.sampleRate; }
        const frames = planes[0]?.length || 0;
        const trim = media.pcmTrim(sampleIndex, frames);
        if (trim && trim.frameCount > 0) acc.push(planes.map((p) => p.subarray(trim.sourceFrameStart, trim.sourceFrameStart + trim.frameCount)), rate);
        n += 1;
        if (n % 400 === 0) { onProgress?.(n / Math.max(1, media.sampleCount)); await yieldToUi(); }
      }
    } finally { decoder.free(); }
  } finally { media.close(); }
  return acc.finish();
}

/** Decode a File/Blob with soundkit-wasm. Returns planar Float32 PCM at the source sample rate. */
export async function decodeWithSoundkit(file, { onProgress } = {}) {
  const { sk, runtime } = await loadSoundkit();
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  const format = sniffFormat(head, file.name || "");
  if (format === "mp4") return { ...(await decodeMp4(sk, runtime, file, onProgress)), format };
  if (format === "caf") {
    const acc = new PlanarAccumulator();
    for await (const { frame } of runtime.decodeSeekableCafAlac(cachedSource(file), sk)) acc.push(interleavedBytesToPlanar(frame.data, frame.channels, frame.bitsPerSample, false), frame.sampleRate);
    return { ...acc.finish(), format };
  }
  try {
    return { ...(await decodeSequential(sk, file, format, head, onProgress)), format };
  } catch (error) {
    if (format === "auto") throw error;
    return { ...(await decodeSequential(sk, file, "auto", head, onProgress)), format: "auto" };
  }
}

export function planarToAudioBuffer(pcm, context) {
  const options = { length: pcm.length, numberOfChannels: pcm.channels.length, sampleRate: pcm.sampleRate };
  const buffer = typeof AudioBuffer === "function" ? new AudioBuffer(options) : context.createBuffer(options.numberOfChannels, options.length, options.sampleRate);
  pcm.channels.forEach((data, channel) => buffer.copyToChannel(data, channel));
  return buffer;
}

/**
 * Decode with the browser first (existing behaviour), falling back to soundkit-wasm.
 * Resolves { buffer, via, format }. Throws the browser's error if both decoders fail.
 */
export async function decodeAudioFile(file, context, { onFallback, onProgress } = {}) {
  let browserError = null;
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (buffer && buffer.length > 0) return { buffer, via: "browser", format: null };
    browserError = new Error("Browser decoder returned no audio");
  } catch (error) { browserError = error; }
  onFallback?.(browserError);
  try {
    const pcm = await decodeWithSoundkit(file, { onProgress });
    return { buffer: planarToAudioBuffer(pcm, context), via: "soundkit", format: pcm.format };
  } catch (soundkitError) {
    const message = `This audio could not be decoded locally (browser: ${browserError?.message || browserError}; soundkit: ${soundkitError?.message || soundkitError})`;
    const error = new Error(message);
    error.browserError = browserError; error.soundkitError = soundkitError;
    throw error;
  }
}

// ---------- analysis helpers ----------
export function toMono(buffer, maxSeconds = Infinity) {
  const length = Math.min(buffer.length, Math.floor(maxSeconds * buffer.sampleRate));
  const out = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) out[i] += data[i];
  }
  if (buffer.numberOfChannels > 1) for (let i = 0; i < length; i += 1) out[i] /= buffer.numberOfChannels;
  return out;
}

export async function resampleMono(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (OAC) {
    const ctx = new OAC(1, Math.max(1, Math.ceil(samples.length * toRate / fromRate)), toRate);
    const buffer = ctx.createBuffer(1, samples.length, fromRate);
    buffer.copyToChannel(samples, 0);
    const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination); src.start();
    return (await ctx.startRendering()).getChannelData(0);
  }
  // Linear fallback (non-browser environments).
  const ratio = fromRate / toRate; const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) { const x = i * ratio; const j = Math.floor(x); const f = x - j; out[i] = (samples[j] || 0) * (1 - f) + (samples[j + 1] || 0) * f; }
  return out;
}

/**
 * Log-mel spectrogram via mel-spec's SpeechToMel (Whisper-compatible log10 mel power).
 * Returns frame-major Float32Array data[frame * mels + mel].
 */
export async function computeMel(samples, sampleRate, { mels = 128, rate = 22050, fft = 2048, hop = 0, maxFrames = 1600 } = {}) {
  const mel = await loadMelSpec();
  const input = await resampleMono(samples, sampleRate, rate);
  let hopSize = hop || Math.max(256, Math.ceil(input.length / maxFrames));
  let fftSize = fft;
  while (fftSize < hopSize) fftSize *= 2;
  const engine = mel.SpeechToMel.new(fftSize, hopSize, rate, mels);
  const frames = Math.floor(input.length / hopSize);
  const data = new Float32Array(frames * mels);
  let produced = 0; let lo = Infinity; let hi = -Infinity;
  try {
    for (let i = 0; i < frames; i += 1) {
      const result = engine.add(input.subarray(i * hopSize, (i + 1) * hopSize), false);
      if (result && result.ok && result.frame) {
        const { frame, min, max } = result; const scale = (max - min) / 255;
        const base = produced * mels;
        for (let m = 0; m < mels; m += 1) data[base + m] = min + frame[m] * scale;
        if (max > hi) hi = max; if (min < lo) lo = min;
        produced += 1;
      }
      if (i % 2000 === 1999) await yieldToUi();
    }
  } finally { engine.free(); }
  return { data: data.subarray(0, produced * mels), frames: produced, mels, hopSeconds: hopSize / rate, fftSize, hopSize, rate, min: lo, max: hi };
}

const MAGMA = [[0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191]];
function lutFrom(stops) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const x = (i / 255) * (stops.length - 1); const j = Math.min(stops.length - 2, Math.floor(x)); const f = x - j;
    for (let k = 0; k < 3; k += 1) lut[i * 3 + k] = stops[j][k] + (stops[j + 1][k] - stops[j][k]) * f;
  }
  return lut;
}
const DEFAULT_LUT = lutFrom(MAGMA);

/** Draw a mel spectrogram onto a canvas. `ceiling` lets two views share one scale (before/after). */
export function drawMel(canvas, mel, { ceiling = mel.max, rangeDb = 80, stops = null, duration = 0 } = {}) {
  const width = canvas.width; const height = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  const lut = stops ? lutFrom(stops) : DEFAULT_LUT;
  const floor = ceiling - rangeDb / 10; // log10 power: 1.0 == 10 dB
  const totalFrames = duration && mel.hopSeconds ? Math.max(mel.frames, Math.round(duration / mel.hopSeconds)) : mel.frames;
  for (let x = 0; x < width; x += 1) {
    const f0 = Math.floor((x / width) * totalFrames); const f1 = Math.max(f0 + 1, Math.floor(((x + 1) / width) * totalFrames));
    for (let y = 0; y < height; y += 1) {
      const m = Math.min(mel.mels - 1, Math.floor(((height - 1 - y) / height) * mel.mels));
      let v = -Infinity;
      for (let f = f0; f < f1 && f < mel.frames; f += 1) { const s = mel.data[f * mel.mels + m]; if (s > v) v = s; }
      const t = v === -Infinity ? 0 : Math.max(0, Math.min(1, (v - floor) / (ceiling - floor)));
      const idx = Math.round(t * 255) * 3; const p = (y * width + x) * 4;
      img.data[p] = lut[idx]; img.data[p + 1] = lut[idx + 1]; img.data[p + 2] = lut[idx + 2]; img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Model-free voice activity via mel-spec's VAD (Sobel edge structure over 16 kHz mel frames).
 * Works best on vocal stems; on full mixes it marks "vocal-like" regions.
 */
export async function detectVoiceActivity(samples, sampleRate, { minEnergy = 1.0, minY = 3, minX = 3, minMel = 0, minSegment = 0.6, mergeGap = 0.8 } = {}) {
  const mel = await loadMelSpec();
  const rate = 16000; const fft = 400; const hop = 160;
  const input = await resampleMono(samples, sampleRate, rate);
  const engine = mel.SpeechToMel.newWithVadSettings(fft, hop, rate, 80, minEnergy, minY, minX, minMel);
  const frames = Math.floor(input.length / hop);
  const activity = new Uint8Array(frames);
  let last = 0;
  try {
    for (let i = 0; i < frames; i += 1) {
      const result = engine.add(input.subarray(i * hop, (i + 1) * hop), true);
      if (result && typeof result.va === "boolean") last = result.va ? 1 : 0;
      activity[i] = last;
      if (i % 4000 === 3999) await yieldToUi();
    }
  } finally { engine.free(); }
  const frameSec = hop / rate; const raw = [];
  let start = -1;
  for (let i = 0; i <= frames; i += 1) {
    const on = i < frames && activity[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) { raw.push({ start: start * frameSec, end: i * frameSec }); start = -1; }
  }
  const merged = [];
  for (const seg of raw) {
    const prev = merged[merged.length - 1];
    if (prev && seg.start - prev.end <= mergeGap) prev.end = seg.end; else merged.push({ ...seg });
  }
  const segments = merged.filter((s) => s.end - s.start >= minSegment);
  const active = segments.reduce((sum, s) => sum + s.end - s.start, 0);
  return { segments, frameSec, activity, duration: input.length / rate, activeRatio: input.length ? active / (input.length / rate) : 0 };
}

// ---------- FLAC export (wavey-ai/flac, Apache-2.0) ----------
// Quantisation is done here so a tool can match its own WAV writer exactly:
//   "round" -> Math.round(v < 0 ? v * 2^(b-1) : v * (2^(b-1) - 1))   (reTUNE 24-bit WAV writer)
//   "trunc" -> truncate (v < 0 ? v * 2^(b-1) : v * (2^(b-1) - 1))      (DataView.setInt16 WAV writers)
function quantizePlanar(buffer, bits, mode) {
  const channels = buffer.numberOfChannels, length = buffer.length;
  const neg = 2 ** (bits - 1), pos = neg - 1;
  const planar = new Int32Array(channels * length);
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c), base = c * length;
    for (let i = 0; i < length; i += 1) {
      const v = data[i] > 1 ? 1 : data[i] < -1 ? -1 : data[i] || 0;
      const x = v < 0 ? v * neg : v * pos;
      planar[base + i] = mode === "trunc" ? Math.trunc(x) : Math.round(x);
    }
  }
  return { planar, channels, sampleRate: buffer.sampleRate, length };
}

function encodeFlacInWorker(job) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("flac/flac-worker.js", BASE), { type: "module" }); } catch (error) { reject(error); return; }
    const done = (fn, value) => { worker.terminate(); fn(value); };
    worker.onmessage = (event) => (event.data && event.data.ok ? done(resolve, event.data.bytes) : done(reject, new Error(event.data?.error || "FLAC worker failed")));
    worker.onerror = (event) => { event.preventDefault?.(); done(reject, new Error(event.message || "FLAC worker failed to start")); };
    worker.postMessage({ ...job, base: BASE.href }, [job.planar.buffer]);
  });
}

/**
 * Lossless FLAC of an AudioBuffer. Runs in a module Worker when possible, else on the main thread.
 * bits: 16 or 24 (default 24); level: 0 realtime, 1 balanced (default), 2 maximum; quantize: "round" | "trunc".
 * If the final FLAC block would be shorter than 32 samples it is padded with < 32 samples of silence (< 1 ms).
 */
export async function encodeFlac(buffer, { bits = 24, level = 1, quantize = "round", worker = true } = {}) {
  let bytes = null;
  if (worker && typeof Worker === "function") {
    try { bytes = await encodeFlacInWorker({ ...quantizePlanar(buffer, bits, quantize), bits, level }); } catch (error) { console.warn("[wavey-audio] FLAC worker unavailable, encoding on main thread", error); }
  }
  if (!bytes) {
    const flac = await loadFlac();
    const job = quantizePlanar(buffer, bits, quantize);
    bytes = flac.encode_planar_i32(job.planar, job.channels, job.sampleRate, bits, level);
  }
  return new Blob([bytes], { type: "audio/flac" });
}

// ---------- timbre / tonal balance (wavey-ai/mfcc-rust "speechsauce", Apache-2.0) ----------
export const TIMBRE_OPTS = { rate: 22050, fft: 2048, chunkSeconds: 4, lowHz: 30, highHz: 11025, maxSeconds: 600 };
const MFCC_N = 13, BANDS_N = 40;
const hzToMel = (f) => 1127 * Math.log(1 + f / 700), melToHz = (m) => 700 * (Math.exp(m / 1127) - 1);
export function timbreBandCenters({ lowHz, highHz } = TIMBRE_OPTS) {
  const a = hzToMel(lowHz), b = hzToMel(highHz), step = (b - a) / (BANDS_N + 1);
  return Array.from({ length: BANDS_N }, (_, i) => melToHz(a + step * (i + 1)));
}
export const TIMBRE_ZONES = [["Low", 30, 120], ["Low-mid", 120, 500], ["Mid", 500, 2000], ["Presence", 2000, 6000], ["Air", 6000, 11025]];

/** MFCC + 40-band log mel energy summary of a track (frames within 50 dB of the loudest frame). */
export async function timbreProfile(buffer, opts = {}) {
  const o = { ...TIMBRE_OPTS, ...opts };
  const mod = await loadMfcc();
  const mono = await resampleMono(toMono(buffer, o.maxSeconds), buffer.sampleRate, o.rate);
  const frames = mod.analyze(mono, o.rate, o.fft, o.chunkSeconds, o.lowHz, o.highHz);
  const stride = MFCC_N + BANDS_N, n = Math.floor(frames.length / stride);
  let maxE = -Infinity;
  for (let f = 0; f < n; f += 1) if (Number.isFinite(frames[f * stride])) maxE = Math.max(maxE, frames[f * stride]);
  const gate = maxE - Math.log(1e5);
  const keep = [];
  for (let f = 0; f < n; f += 1) if (Number.isFinite(frames[f * stride]) && frames[f * stride] > gate) keep.push(f);
  if (keep.length < 8) throw new Error("Not enough audible audio for a timbre profile (need at least ~5 seconds)");
  const mean = new Float64Array(stride), sq = new Float64Array(stride), power = new Float64Array(BANDS_N);
  for (const f of keep) {
    for (let j = 0; j < stride; j += 1) { const v = frames[f * stride + j]; mean[j] += v; sq[j] += v * v; }
    for (let b = 0; b < BANDS_N; b += 1) power[b] += Math.exp(frames[f * stride + MFCC_N + b]);
  }
  for (let j = 0; j < stride; j += 1) { mean[j] /= keep.length; sq[j] = Math.sqrt(Math.max(0, sq[j] / keep.length - mean[j] * mean[j])); }
  return {
    seconds: mono.length / o.rate, frames: n, audibleFrames: keep.length,
    mfccMean: Array.from(mean.slice(1, MFCC_N)), mfccStd: Array.from(sq.slice(1, MFCC_N)),
    // Long-term average spectrum: mean energy per band (power domain), in dB. Robust to near-silent passages.
    bandsDb: Array.from(power, (e) => 10 * Math.log10(e / keep.length + 1e-30)), opts: o,
  };
}

/**
 * Compare two timbre profiles. Level-independent: band differences are re-centred on their median.
 * match: 0-100 (MFCC distance mapped through exp(-(d/8)^1.5)); zones: mean dB difference per zone (mine - ref).
 */
export function compareTimbre(mine, ref) {
  let d2 = 0;
  for (let i = 0; i < mine.mfccMean.length; i += 1) d2 += (mine.mfccMean[i] - ref.mfccMean[i]) ** 2 + 0.5 * (mine.mfccStd[i] - ref.mfccStd[i]) ** 2;
  const distance = Math.sqrt(d2);
  const raw = mine.bandsDb.map((v, i) => v - ref.bandsDb[i]);
  const sorted = [...raw].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  const diff = raw.map((v) => v - median);
  const centers = timbreBandCenters(mine.opts);
  const zones = TIMBRE_ZONES.map(([name, lo, hi]) => {
    const idx = centers.map((c, i) => (c >= lo && c < hi ? i : -1)).filter((i) => i >= 0);
    return { name, lo, hi, db: idx.reduce((s, i) => s + diff[i], 0) / Math.max(1, idx.length) };
  });
  const match = Math.round(100 * Math.exp(-((distance / 8) ** 1.5)));
  const label = match >= 85 ? "very close" : match >= 65 ? "close" : match >= 40 ? "different" : "very different";
  return { match, label, distance, diff, centers, zones, levelOffsetDb: median };
}

export const CREDITS = "Uses soundkit / mel-spec by wavey-ai (MIT) · flac / mfcc-rust by wavey-ai (Apache-2.0)";
