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

/**
 * cands: [{score, dist, i}] best first; transcriptLp = log-prob of the free (greedy) transcript.
 * Accept the best phrase if the transcript is (almost) that phrase (dist <= maxDist), or if the phrase's log-prob is
 * within `margin` of the transcript's; one-word phrases ("play", "stop", ...) get the tighter `marginSingleWord`,
 * because short real words ("up", "dog", "drop") otherwise slide onto them. An empty transcript is never a command.
 * Thresholds were tuned on a held-out "tune" split of real human recordings (tools/earlybird-export/REAL_VOICES.md).
 */
export function decide(cands, transcriptLp, phrases, { margin = 8, marginSingleWord = 4, maxDist = 0.15 } = {}, transcript = null) {
  if (!cands.length) return null;
  if (transcript !== null && !norm(transcript)) return null;
  const c = cands[0], p = phrases[c.i], gap = c.score - transcriptLp;
  const m = p.text.trim().split(/\s+/).length === 1 ? marginSingleWord : margin;
  if (c.dist > maxDist && gap < -m) return null;
  return { ...p, score: c.score, dist: c.dist, gap };
}
