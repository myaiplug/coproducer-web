import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sentences, finished, fit } from '../text.js';
import { encodeWav, decodeWav, normalizePeak, trimSilence, limitPeak, sha256Hex, toMono, bytesToBase64 } from '../audio.js';
import { TINYVOCA_FILES, ZONOS3_MODELS_BASE, ZONOS3_HF_COMMIT, TINYVOCA_HF_COMMIT, ENGINES, KITTEN_FILES, KITTEN_HF_COMMIT, KITTEN_WHEELS, KITTEN_FRONTEND_FILES, KITTEN_VOICES, VOXMEL_GIT_COMMIT, VOXMEL_LOCAL_DEFAULT } from '../models.js';
import { tokens, trimChunk } from '../kitten-worker.js';

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
  assert.ok(ENGINES.every((e) => /MIT|Apache/.test(e.license)));  // only permissive engines are hosted by the page
});

test('vendored code ships with its licence files', () => {
  const v = new URL('../vendor/', import.meta.url);
  for (const f of ['zonos3-web/LICENSE', 'zonos3-web/NOTICE', 'zonos3-web/engine.js', 'zonos3-web/worker.js', 'zonos3-web/codec-worker.js', 'dizione/LICENSE', 'dizione/dizione-0.1.0.zip']) assert.ok(fs.existsSync(new URL(f, v)), f);
  assert.match(fs.readFileSync(new URL('zonos3-web/LICENSE', v), 'utf8'), /MIT License/);
  assert.match(fs.readFileSync(new URL('dizione/LICENSE', v), 'utf8'), /Apache License/);
});

test('Kitten: files pinned to one Hugging Face commit with SHA-256 and sizes; wheels pinned too', () => {
  assert.equal(KITTEN_HF_COMMIT.length, 40);
  for (const [p, f] of Object.entries(KITTEN_FILES)) { assert.ok(f.url.endsWith(`/resolve/${KITTEN_HF_COMMIT}/${p}`), p); assert.match(f.sha256, /^[0-9a-f]{64}$/); assert.ok(f.bytes > 0); }
  for (const w of KITTEN_WHEELS) { assert.ok(w.url.startsWith('https://files.pythonhosted.org/') && w.url.endsWith(w.name)); assert.match(w.sha256, /^[0-9a-f]{64}$/); }
  assert.equal(KITTEN_VOICES.length, 11); assert.ok(KITTEN_VOICES.some((v) => v.id === 'eleanor'));
  assert.ok(ENGINES.some((e) => e.id === 'kitten'));
  assert.equal(VOXMEL_GIT_COMMIT.length, 40); assert.match(VOXMEL_LOCAL_DEFAULT, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('Kitten: vendored front end is present with its licence and notice', () => {
  const v = new URL('../vendor/kitten-frontend/', import.meta.url);
  for (const f of KITTEN_FRONTEND_FILES) assert.ok(fs.existsSync(new URL('kfront/' + f, v)), f);
  assert.match(fs.readFileSync(new URL('LICENSE', v), 'utf8'), /Apache License/);
  assert.match(fs.readFileSync(new URL('NOTICE', v), 'utf8'), /d13d8c978a8f17d441977d714b75853ae6bd4423/);
});

test('Kitten: tokens() matches KittenTTS2Tiny._tokens (pad, end token 10, brackets -> comma)', () => {
  const vocab = { ',': 3, 'a': 43, 'b': 44, ' ': 16 };
  assert.deepEqual(tokens('a (b)', vocab), [0, 43, 16, 3, 44, 3, 10, 0]);
  assert.deepEqual(tokens('aZ', vocab), [0, 43, 10, 0]);
});

test('Kitten: trimChunk() matches the Python trimming and fades', () => {
  const wav = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i * 0.01) * 1.2), dur = [3n, 2n, 1n, 2n];
  // reference values from kittenml/kittentts2_tiny/model.py _chunk on the same input
  const ref = { true: [4200, [0.0, 0.00252, 0.840336, 1.0, -0.042017, 0]], false: [3000, [0, -0.024894, 0.423698, 1.0, -0.042017, 0]] };
  for (const keep of [true, false]) {
    const w = trimChunk(wav, dur, keep), [n, vals] = ref[keep];
    assert.equal(w.length, n);
    const got = [w[0], w[5], w[100], w[Math.floor(n / 2)], w[n - 6], w[n - 1]];
    got.forEach((g, i) => assert.ok(Math.abs(g - vals[i]) < 2e-5, `${keep} ${i}: ${g} vs ${vals[i]}`));
  }
});

test('VoxMel helpers: mono mixdown with a length cap, base64 of large buffers', () => {
  const buf = { numberOfChannels: 2, sampleRate: 10, length: 50, getChannelData: (c) => new Float32Array(50).fill(c ? 1 : 0) };
  const m = toMono(buf, 3); assert.equal(m.length, 30); assert.ok(m.every((x) => x === 0.5));
  const big = new Uint8Array(100000).map((_, i) => i & 255);
  assert.deepEqual(Uint8Array.from(Buffer.from(bytesToBase64(big), 'base64')), big);
});
