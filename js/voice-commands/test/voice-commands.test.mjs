import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { halfToFloat, parseSafetensors, unpackTensor, buildExternal } from '../unpack.js';
import { lev, norm, nearest, decide, detok, logSoftmaxRow } from '../grammar.js';
import { applyCommand, targets } from '../actions.js';
import { resample } from '../audio-in.js';
import { EARLYBIRD_WEIGHTS, EARLYBIRD_HF_COMMIT, EXTERNAL_SHA256, DECISION } from '../models.js';

const M = new URL('../model/', import.meta.url);
const G = JSON.parse(fs.readFileSync(new URL('commands.json', M)));
const VOC = JSON.parse(fs.readFileSync(new URL('vocab.json', M)));

test('half floats', () => {
  assert.equal(halfToFloat(0x3c00), 1); assert.equal(halfToFloat(0xc000), -2); assert.equal(halfToFloat(0x0001), 2 ** -24);
  assert.equal(halfToFloat(0x7bff), 65504); assert.equal(halfToFloat(0x7c00), Infinity);
});

/** A tiny safetensors file packed the way Earlybird packs (4-bit, group 4, last group padded). */
function tiny() {
  const rows = 2, n = 6, G = 4, groups = 2, codes = [1, 2, 3, 4, 5, 6, 15, 14, 13, 12, 11, 10];
  const q = new Uint8Array(6); codes.forEach((c, i) => { q[i >> 1] |= i & 1 ? c << 4 : c; });
  const s = new Uint16Array([0x3800, 0x3400, 0x4000, 0x3c00]), z = new Uint16Array([0xbc00, 0x0000, 0x3800, 0xb800]);  // 0.5 .25 2 1 / -1 0 .5 -.5
  const meta = { w: { bits: 4, shape: [rows, n], n, group: G, codes: rows * n } };
  const header = { __metadata__: { earlybird: JSON.stringify(meta) }, 'w.q': { dtype: 'U8', shape: [6], data_offsets: [0, 6] },
    'w.s': { dtype: 'F16', shape: [rows, groups], data_offsets: [6, 14] }, 'w.z': { dtype: 'F16', shape: [rows, groups], data_offsets: [14, 22] } };
  const h = new TextEncoder().encode(JSON.stringify(header)), out = new Uint8Array(8 + h.length + 22);
  new DataView(out.buffer).setBigUint64(0, BigInt(h.length), true); out.set(h, 8);
  out.set(q, 8 + h.length); out.set(new Uint8Array(s.buffer), 8 + h.length + 6); out.set(new Uint8Array(z.buffer), 8 + h.length + 14);
  return { out, codes };
}

test('unpack: 4-bit codes (low nibble first), per-group scale and zero, padded last group', () => {
  const { out, codes } = tiny(); const st = parseSafetensors(out); const w = unpackTensor(out, st, 'w');
  const want = codes.map((c, k) => { const r = Math.floor(k / 6), j = k % 6, g = Math.floor(j / 4), s = [[0.5, 0.25], [2, 1]][r][g], z = [[-1, 0], [0.5, -0.5]][r][g]; return c * s + z; });
  assert.deepEqual(Array.from(w), want);
  const ext = buildExternal(out, st, { bytes: 48, tensors: [{ name: 'wT', src: 'w', transpose: true, shape: [6, 2], offset: 0, length: 48 }] });
  const f = new Float32Array(ext.buffer); assert.equal(f[1], w[6]); assert.equal(f[2], w[1]);
});

const LOCAL = process.env.EARLYBIRD_SAFETENSORS;  // optional: the real file, to check the pinned unpacked hashes
test('unpack the real weights file to the pinned hashes (set EARLYBIRD_SAFETENSORS)', { skip: !LOCAL }, () => {
  const b = new Uint8Array(fs.readFileSync(LOCAL)); assert.equal(crypto.createHash('sha256').update(b).digest('hex'), EARLYBIRD_WEIGHTS.sha256);
  const st = parseSafetensors(b), cache = new Map();
  for (const k of ['encoder', 'decoder']) {
    const buf = buildExternal(b, st, JSON.parse(fs.readFileSync(new URL(`${k}_weights.json`, M))), cache);
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), EXTERNAL_SHA256[k], k);
  }
});

test('model is pinned', () => {
  assert.equal(EARLYBIRD_HF_COMMIT.length, 40); assert.ok(EARLYBIRD_WEIGHTS.url.includes(`/resolve/${EARLYBIRD_HF_COMMIT}/`)); assert.match(EARLYBIRD_WEIGHTS.sha256, /^[0-9a-f]{64}$/);
});

test('grammar: edit distance, nearest phrases, detokenise', () => {
  assert.equal(lev('kitten', 'sitting'), 3); assert.equal(lev('', 'abc'), 3);
  assert.equal(norm('Drop the bass.'), 'drop the bass');
  assert.equal(G.phrases[nearest('Drop the base.', G.phrases)[0].i].text, 'drop the bass');
  const f = G.phrases.find((p) => p.text === 'solo the drums').forms[0];
  assert.equal(detok(f, VOC), 'Solo the drums.');
});

test('decide: accept on log-prob gap or edit distance, tighter for one-word phrases, never on silence', () => {
  const ph = [{ text: 'stop', action: 'stop', stem: null }, { text: 'mute the bass', action: 'mute', stem: 'bass' }];
  assert.equal(decide([{ score: -5, dist: 0.9, i: 0 }], -3, ph).action, 'stop');      // gap -2 >= -4
  assert.equal(decide([{ score: -8, dist: 0.9, i: 0 }], -3, ph), null);               // gap -5 < -4 (one word)
  assert.equal(decide([{ score: -8, dist: 0.9, i: 1 }], -3, ph).action, 'mute');      // gap -5 >= -8 (three words)
  assert.equal(decide([{ score: -12, dist: 0.9, i: 1 }], -3, ph), null);
  assert.equal(decide([{ score: -30, dist: 0.1, i: 0 }], -3, ph).action, 'stop');     // transcript is the phrase
  assert.equal(decide([{ score: -30, dist: 0.2, i: 0 }], -3, ph), null);
  assert.equal(decide([{ score: -1, dist: 0.0, i: 0 }], -1, ph, undefined, ''), null); // empty transcript
  assert.equal(decide([], 0, ph), null);
  const r = logSoftmaxRow(Float32Array.from([1, 2, 3]), 0, 3); assert.ok(Math.abs(Math.exp(r(0)) + Math.exp(r(1)) + Math.exp(r(2)) - 1) < 1e-9);
});

test('decision thresholds are the held-out-tuned ones', () => {
  assert.deepEqual(DECISION, { topK: 8, margin: 8, marginSingleWord: 4, maxDist: 0.15 });
});

function fakeEngine(kinds) {
  const calls = []; const tracks = kinds.map((k, i) => ({ id: 't' + i, kind: k, name: k, mute: false, solo: false }));
  return { tracks, playing: false, calls, setMix(t, p) { Object.assign(t, p); calls.push([t.kind, p]); }, play() { this.playing = true; calls.push('play'); }, pause() { this.playing = false; calls.push('pause'); }, stop() { this.playing = false; calls.push('stop'); } };
}

test('actions: mute / solo / unsolo / transport / export / missing stems', () => {
  const e = fakeEngine(['vocals', 'drums', 'bass', 'other']);
  assert.equal(applyCommand({ action: 'mute', stem: 'bass' }, e), 'mute:bass'); assert.equal(e.tracks[2].mute, true);
  assert.equal(applyCommand({ action: 'solo', stem: 'drums' }, e), 'solo:drums'); assert.equal(e.tracks[1].solo, true);
  assert.equal(applyCommand({ action: 'solo', stem: 'vocals' }, e), 'solo:vocals'); assert.equal(e.tracks[1].solo, false); assert.equal(e.tracks[0].solo, true);
  assert.equal(applyCommand({ action: 'unsolo', stem: null }, e), 'unsolo'); assert.ok(e.tracks.every((t) => !t.solo));
  assert.equal(applyCommand({ action: 'unmute_all', stem: null }, e), 'unmute_all'); assert.ok(e.tracks.every((t) => !t.mute));
  assert.equal(applyCommand({ action: 'play', stem: null }, e), 'play'); assert.equal(e.playing, true);
  assert.equal(applyCommand({ action: 'stop', stem: null }, e), 'stop'); assert.equal(e.playing, false);
  let ex = 0; assert.equal(applyCommand({ action: 'export', stem: null }, e, { exportNow: () => ex++ }), 'export'); assert.equal(ex, 1);
  assert.equal(applyCommand({ action: 'mute', stem: 'piano' }, e), 'missing:piano');
  assert.equal(applyCommand(null, e), 'not_understood');
  assert.equal(applyCommand({ action: 'mute', stem: 'bass' }, fakeEngine([])), 'no_stems');
  const split = fakeEngine(['lead', 'backing', 'kick', 'snare']);
  assert.deepEqual(targets(split.tracks, 'vocals').map((t) => t.kind), ['lead', 'backing']);
  assert.deepEqual(targets(split.tracks, 'drums').map((t) => t.kind), ['kick', 'snare']);
});

test('every action key has a guide-voice clip', () => {
  const clips = JSON.parse(fs.readFileSync(new URL('../../guide-voice/clips/clips.json', import.meta.url))).clips;
  const stems = [...new Set(G.phrases.map((p) => p.stem).filter(Boolean))];
  for (const s of stems) for (const a of ['mute', 'unmute', 'solo', 'missing']) assert.ok(clips[`${a}:${s}`], `${a}:${s}`);
  for (const k of ['play', 'pause', 'stop', 'export', 'unsolo', 'unmute_all', 'no_stems', 'not_understood']) assert.ok(clips[k], k);
});

test('resample 48k -> 16k keeps a 1 kHz tone and its level', () => {
  const x = Float32Array.from({ length: 48000 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000));
  const y = resample(x, 48000, 16000); assert.equal(y.length, 16000);
  let e = 0, p = 0; for (let i = 100; i < 15900; i++) { const r = 0.5 * Math.sin(2 * Math.PI * 1000 * i / 16000); e += (y[i] - r) ** 2; p += r * r; }
  assert.ok(10 * Math.log10(p / e) > 40, 'SNR');
});

test('self-test page phrases: every expected command is in the grammar', async () => {
  const { SELF_TEST, judge } = await import('../self-test.js');
  const have = new Set(G.phrases.map((p) => `${p.action}|${p.stem}`));
  for (const t of SELF_TEST) if (t.want) assert.ok(have.has(`${t.want[0]}|${t.want[1]}`), t.say);
  assert.equal(judge({ want: ['mute', 'bass'] }, { action: 'mute', stem: 'bass' }).pass, true);
  assert.equal(judge({ want: ['mute', 'bass'] }, null).pass, false);
  assert.equal(judge({ want: null }, { action: 'stop', stem: null }).pass, false);
  assert.equal(judge({ want: null }, null).pass, true);
});
