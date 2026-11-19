/** Pure helpers for the Inflect Mini v3 ONNX graphs (no DOM, no ONNX Runtime): tokens, alignment, voice rows. */

/** Phoneme string -> token ids: [0, ...ids, 0]. Symbols outside the vocab are dropped (as Inflect's own front end). */
export function tokens(phonemes, vocab) {
  const ids = [0];
  for (const ch of phonemes) if (ch in vocab) ids.push(vocab[ch]);
  ids.push(0);
  return ids;
}

/** Round half to even, as numpy / torch round (the reference pipeline). */
export function roundHalfEven(x) { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; }

/** Predicted durations -> frames per token, max(round(d), 1) with round half to even, capped so the total stays <= maxFrames. */
export function frameCounts(dur, maxFrames = 1200) {
  const c = Array.from(dur, (d) => Math.max(1, roundHalfEven(Number(d))));
  let total = c.reduce((a, b) => a + b, 0);
  if (total > maxFrames) { const k = maxFrames / total; for (let i = 0; i < c.length; i++) c[i] = Math.max(1, Math.floor(c[i] * k)); total = c.reduce((a, b) => a + b, 0); }
  return { counts: c, frames: total };
}

/** One-hot alignment [T, F] (row-major Float32Array): token i covers counts[i] consecutive frames. */
export function alignment(counts) {
  const T = counts.length, F = counts.reduce((a, b) => a + b, 0), a = new Float32Array(T * F);
  let f = 0; for (let i = 0; i < T; i++) for (let k = 0; k < counts[i]; k++) a[i * F + f++] = 1;
  return { data: a, T, F };
}

/** Style row for a voice: styles[sid, min(T - 3, rows - 1)] (Inflect picks the row by phoneme count). */
export function styleRow(styles, sid, T, rows = 510, dim = 128) {
  const r = Math.max(0, Math.min(T - 3, rows - 1)), o = (sid * rows + r) * dim;
  return styles.subarray(o, o + dim);
}
