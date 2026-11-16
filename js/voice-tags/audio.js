/** Small audio helpers for voice tags: peak limiting, silence trim, mono WAV encoding, WAV parsing. */
export function limitPeak(x, peak = 0.99) {
  let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > peak) { const g = peak / m; for (let i = 0; i < x.length; i++) x[i] *= g; }
  return x;
}
/** Normalise to a target peak in dBFS (up or down). */
export function normalizePeak(x, dbfs = -1) {
  let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) { const g = 10 ** (dbfs / 20) / m; for (let i = 0; i < x.length; i++) x[i] *= g; }
  return x;
}
/** Trim leading / trailing samples below `thresh` (keeps `padS` seconds around the speech). */
export function trimSilence(x, sr, thresh = 0.003, padS = 0.03) {
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thresh) a++;
  while (b > a && Math.abs(x[b]) < thresh) b--;
  if (a >= b) return x;
  const pad = Math.round(padS * sr);
  return x.slice(Math.max(0, a - pad), Math.min(x.length, b + 1 + pad));
}
/** 16-bit PCM mono WAV. */
export function encodeWav(x, sr) {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), true);
  return new Uint8Array(buf);
}
/** Parse a PCM16 / float32 WAV (mono or the first channel). */
export function decodeWav(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 12, fmt = null;
  while (p + 8 <= v.byteLength) {
    const id = String.fromCharCode(...u8.subarray(p, p + 4)), len = v.getUint32(p + 4, true);
    if (id === 'fmt ') fmt = { tag: v.getUint16(p + 8, true), ch: v.getUint16(p + 10, true), sr: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
    if (id === 'data' && fmt) {
      const bps = fmt.bits / 8, n = Math.floor(Math.min(len, v.byteLength - p - 8) / (bps * fmt.ch)), out = new Float32Array(n);
      for (let i = 0; i < n; i++) { const o = p + 8 + i * bps * fmt.ch; out[i] = fmt.tag === 3 ? v.getFloat32(o, true) : v.getInt16(o, true) / 32768; }
      return { pcm: out, sampleRate: fmt.sr };
    }
    p += 8 + len + (len & 1);
  }
  throw new Error('not a PCM WAV');
}
export async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}
