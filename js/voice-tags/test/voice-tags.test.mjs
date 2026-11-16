import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sentences, finished, fit } from '../text.js';
import { encodeWav, decodeWav, normalizePeak, trimSilence, limitPeak, sha256Hex } from '../audio.js';
import { TINYVOCA_FILES, ZONOS3_MODELS_BASE, ZONOS3_HF_COMMIT, TINYVOCA_HF_COMMIT, ENGINES } from '../models.js';

test('sentences: splits on marks, keeps titles and initials together', () => {
  assert.deepEqual(sentences('Produced by Beez. Turn it up!'), ['Produced by Beez.', 'Turn it up!']);
  assert.deepEqual(sentences('Mr. Beez on the beat. Yeah.'), ['Mr. Beez on the beat.', 'Yeah.']);
  assert.deepEqual(sentences('  :)  '), []);
});

test('finished: adds a full stop only when the text has no final mark', () => {
  assert.equal(finished('Produced by Beez'), 'Produced by Beez.');
  assert.equal(finished('Run it back!'), 'Run it back!');
  assert.equal(finished('see you :)'), 'see you :).');
});

test('fit: long sentences are cut at commas, then by words, under max tokens', () => {
  const ph = (s) => ({ ids: Array.from(s.replace(/\s/g, ''), () => 1), stress: [] });
  const long = 'aaaa aaaa aaaa aaaa, bbbb bbbb bbbb bbbb';
  const parts = fit(long, ph, 30);
  assert.ok(parts.length >= 2); assert.ok(parts.every((p) => p.ids.length <= 18));
  assert.deepEqual(fit('x', () => null, 30), []);
});

test('WAV encode/decode round trip, trim and normalise', () => {
  const sr = 24000, x = new Float32Array(sr); for (let i = 6000; i < 18000; i++) x[i] = 0.5 * Math.sin(i * 0.05);
  const t = trimSilence(x, sr); assert.ok(t.length < 13500 && t.length > 12000);
  normalizePeak(t, -1); const pk = t.reduce((m, v) => Math.max(m, Math.abs(v)), 0); assert.ok(Math.abs(pk - 10 ** (-1 / 20)) < 1e-6);
  const w = encodeWav(t, sr); assert.equal(w.length, 44 + t.length * 2);
  const d = decodeWav(w); assert.equal(d.sampleRate, sr); assert.equal(d.pcm.length, t.length);
  for (let i = 0; i < t.length; i += 97) assert.ok(Math.abs(d.pcm[i] - t[i]) < 1e-4);
  const y = Float32Array.from([2, -1]); limitPeak(y); assert.ok(Math.abs(y[0] - 0.99) < 1e-6);
});

test('sha256Hex matches a known digest', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('models are pinned to immutable Hugging Face commits with SHA-256', () => {
  assert.equal(ZONOS3_HF_COMMIT.length, 40); assert.ok(ZONOS3_MODELS_BASE.includes(`/resolve/${ZONOS3_HF_COMMIT}/web/`));
  assert.equal(TINYVOCA_HF_COMMIT.length, 40);
  for (const f of [TINYVOCA_FILES.model, TINYVOCA_FILES.config, ...Object.values(TINYVOCA_FILES.phonemizer)]) { assert.ok(f.url.includes(`/resolve/${TINYVOCA_HF_COMMIT}/`)); assert.match(f.sha256, /^[0-9a-f]{64}$/); }
  assert.ok(ENGINES.every((e) => /MIT|Apache/.test(e.license)));
});

test('vendored code ships with its licence files', () => {
  const v = new URL('../vendor/', import.meta.url);
  for (const f of ['zonos3-web/LICENSE', 'zonos3-web/NOTICE', 'zonos3-web/engine.js', 'zonos3-web/worker.js', 'zonos3-web/codec-worker.js', 'dizione/LICENSE', 'dizione/dizione-0.1.0.zip']) assert.ok(fs.existsSync(new URL(f, v)), f);
  assert.match(fs.readFileSync(new URL('zonos3-web/LICENSE', v), 'utf8'), /MIT License/);
  assert.match(fs.readFileSync(new URL('dizione/LICENSE', v), 'utf8'), /Apache License/);
});
