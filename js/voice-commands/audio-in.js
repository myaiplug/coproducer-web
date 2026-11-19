/** Microphone helpers: resample to 16 kHz (windowed sinc), clip length. */
export function resample(x, from, to = 16000) {
  if (from === to) return Float32Array.from(x);
  const ratio = to / from, n = Math.floor(x.length * ratio), out = new Float32Array(n);
  const fc = Math.min(1, ratio) * 0.92, half = 16;                 // low-pass below the new Nyquist
  for (let i = 0; i < n; i++) {
    const c = i / ratio, c0 = Math.floor(c); let s = 0, w = 0;
    for (let k = c0 - half + 1; k <= c0 + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = c - k, sinc = d === 0 ? 1 : Math.sin(Math.PI * fc * d) / (Math.PI * fc * d);
      const win = 0.5 + 0.5 * Math.cos(Math.PI * d / half), h = fc * sinc * win; s += x[k] * h; w += h;
    }
    out[i] = w ? s / w : 0;
  }
  return out;
}
export function concat(chunks) { const n = chunks.reduce((a, c) => a + c.length, 0), o = new Float32Array(n); let p = 0; for (const c of chunks) { o.set(c, p); p += c.length; } return o; }
