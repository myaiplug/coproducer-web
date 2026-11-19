/** Text side of voice commands: detokenise, normalise, edit distance, candidate list and the accept rule. */
export const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').trim();

export function detok(ids, vocab) {
  return ids.map((i) => vocab[i] ?? '').join('').replace(/▁/g, ' ').replace(/<0x([0-9A-F]{2})>/g, (_, h) => String.fromCharCode(parseInt(h, 16))).trim();
}

export function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let p = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] !== b[j - 1] ? 1 : 0)); p = t; }
  }
  return d[b.length];
}

/** Grammar phrases closest to the transcript: [{dist, i}] sorted (ties by index, as Python's sorted tuples). */
export function nearest(text, phrases, k = 8) {
  const n = norm(text);
  return phrases.map((p, i) => ({ dist: lev(n, p.text) / Math.max(n.length, p.text.length, 1), i }))
    .sort((a, b) => a.dist - b.dist || a.i - b.i).slice(0, k);
}

export function logSoftmaxRow(x, off, V) {
  let m = -Infinity; for (let j = 0; j < V; j++) m = Math.max(m, x[off + j]);
  let s = 0; for (let j = 0; j < V; j++) s += Math.exp(x[off + j] - m);
  const l = m + Math.log(s); return (j) => x[off + j] - l;
}

/** cands: [{score, dist, i}] best first. Returns the phrase or null. */
export function decide(cands, transcriptLp, phrases, { margin = 12, maxDist = 0.3 } = {}) {
  if (!cands.length) return null;
  const c = cands[0];
  if (c.score < transcriptLp - margin && c.dist > maxDist) return null;
  return { ...phrases[c.i], score: c.score, dist: c.dist, gap: c.score - transcriptLp };
}
