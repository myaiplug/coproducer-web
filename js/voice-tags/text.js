/**
 * Text helpers for tiny-voca, ported from the tiny-voca web demo (web/public/worker.js) and tiny_voca.infer.
 * Copyright n4ze3m, Apache-2.0 (https://github.com/n4ze3m/tiny-voca). Modified: ES module, pure functions.
 */
const ABBREVIATIONS = /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|no|inc|ltd|co|e\.g|i\.e|a\.m|p\.m)|\b[A-Z])\.$/i;

/** Sentences, without breaking after titles, initials or inside numbers. */
export function sentences(text) {
  const parts = [];
  let current = '';
  for (const piece of text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…]["')\]]?)\s+(?=["'(\[]?[A-Z0-9])/)) {
    current = current ? current + ' ' + piece : piece;
    if (!ABBREVIATIONS.test(current)) { parts.push(current); current = ''; }
  }
  if (current) parts.push(current);
  return parts.filter((part) => /[\p{L}\p{N}]/u.test(part));
}

/** Adds a full stop when the text ends without a mark, so the last syllable falls instead of breaking off. */
export function finished(text) {
  const body = text.replace(/\s+$/, '');
  if (!body) return text;
  const last = body.split(/\s+/).pop();
  const marked = /[\p{L}\p{N}]/u.test(last) ? /[.!?…,;:]["'”’)\]»]*$/.test(last) : /[.!?…]/.test(last) || /^[,;:]$/.test(last);
  return marked ? text : body + '.';
}

/** One utterance holds at most maxTokens phonemes; longer sentences are cut at commas, then by words. */
export function fit(sentence, phonemize, maxTokens) {
  const result = phonemize(sentence);
  if (!result) return [];
  if (result.ids.length <= maxTokens - 12) return [result];
  const pieces = sentence.split(/(?<=[,;:—])\s+/);
  if (pieces.length > 1) return pieces.flatMap((p) => fit(p, phonemize, maxTokens));
  const words = sentence.split(' ');
  if (words.length < 2) return [];
  const half = Math.ceil(words.length / 2);
  return [...fit(words.slice(0, half).join(' '), phonemize, maxTokens), ...fit(words.slice(half).join(' '), phonemize, maxTokens)];
}
