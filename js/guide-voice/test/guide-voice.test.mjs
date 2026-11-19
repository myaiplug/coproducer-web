import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { tokens, frameCounts, alignment, styleRow, roundHalfEven } from '../inflect-core.js';
import { INFLECT_HF_COMMIT, INFLECT_ONNX_FILES, INFLECT_ONNX_BASE, inflectBase } from '../models.js';
import { nextTip } from '../guide-voice.js';

const dir = new URL('../', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('inflect_meta.json', dir)));
const lines = JSON.parse(fs.readFileSync(new URL('lines.json', dir)));
const clips = JSON.parse(fs.readFileSync(new URL('clips/clips.json', dir)));

test('tokens: pad 0 both ends, drop unknown symbols', () => {
  const ids = tokens('hˈə?§', meta.vocab);
  assert.equal(ids[0], 0); assert.equal(ids.at(-1), 0);
  assert.deepEqual(ids.slice(1, -1), ['h', 'ˈ', 'ə', '?'].filter((c) => c in meta.vocab).map((c) => meta.vocab[c]));
});

test('frame counts and one-hot alignment match the Python reference (max(round(d),1), np.repeat)', () => {
  const { counts, frames } = frameCounts([0.2, 1.49, 2.5, 3.51, 0], 1200);
  assert.deepEqual(counts, [1, 1, 2, 4, 1]); assert.equal(frames, 9);  // numpy: round(2.5) = 2
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, 3.4999].map(roundHalfEven), [0, 2, 2, -0, 3]);
  const a = alignment([2, 1, 3]);
  assert.equal(a.F, 6);
  for (let f = 0; f < 6; f++) { let s = 0; for (let t = 0; t < 3; t++) s += a.data[t * 6 + f]; assert.equal(s, 1); }
  assert.equal(a.data[0 * 6 + 1], 1); assert.equal(a.data[1 * 6 + 2], 1); assert.equal(a.data[2 * 6 + 5], 1);
  assert.ok(frameCounts(new Array(50).fill(40), 1200).frames <= 1200);
});

test('style row is clamped to the table', () => {
  const s = new Float32Array(6 * 510 * 128).map((_, i) => i);
  assert.equal(styleRow(s, 1, 10)[0], (1 * 510 + 7) * 128);
  assert.equal(styleRow(s, 0, 9999)[0], 509 * 128);
  assert.equal(styleRow(s, 0, 1)[0], 0);
});

test('live engine is pinned and off by default', () => {
  assert.equal(INFLECT_HF_COMMIT.length, 40);
  for (const f of Object.values(INFLECT_ONNX_FILES)) { assert.match(f.sha256, /^[0-9a-f]{64}$/); assert.ok(f.bytes > 0); }
  assert.equal(INFLECT_ONNX_BASE, '');
  assert.equal(inflectBase(''), '');
  assert.equal(inflectBase('?inflectbase=http://x/y'), 'http://x/y/');
  assert.deepEqual(meta.voices, ['hope', 'sophia', 'cassidy', 'james', 'jasper', 'mark']);
});

test('every guide line has a clip with a matching SHA-256 and text', () => {
  const want = [...lines.tips.map((t) => ['tip:' + t.id, t.text]), ...Object.entries(lines.confirm)];
  assert.equal(Object.keys(clips.clips).length, want.length);
  for (const [k, text] of want) {
    const c = clips.clips[k]; assert.ok(c, k); assert.equal(c.text, text);
    const b = fs.readFileSync(new URL('clips/' + c.file, dir));
    assert.equal(crypto.createHash('sha256').update(b).digest('hex'), c.sha256, k);
    assert.ok(c.seconds > 0.4 && c.seconds < 12, k);
  }
  assert.ok(clips.model.endsWith(INFLECT_HF_COMMIT));
});

test('next tip follows what is on screen', () => {
  assert.equal(nextTip({ stems: false }), 'welcome');
  assert.equal(nextTip({ stems: false }, new Set(['welcome'])), 'split');
  assert.equal(nextTip({ stems: true, hasDrums: false, hasVocals: true }, new Set(['lanes', 'fx', 'ab', 'clean'])), 'vocals');
});
