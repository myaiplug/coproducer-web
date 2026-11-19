/**
 * Earlybird-29M weights in the browser, straight from the published file (earlybird.safetensors, MIT): parse the
 * safetensors header, unpack the 4/8-bit groups (fp16 scale and zero point per group of 128) exactly as
 * earlybird.py `_unpack` does in float32, and lay the tensors out as the ONNX graphs' external data.
 * Pure functions: no DOM, no ONNX Runtime (tested in Node against the Python unpacker, byte for byte).
 */

/** IEEE half -> float (exact). */
export function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}

/** bytes -> { header, dataStart, meta } (meta = the `earlybird` packing table). */
export function parseSafetensors(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Number(dv.getBigUint64(0, true));
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n)));
  const meta = JSON.parse(header.__metadata__?.earlybird || 'null');
  if (!meta) throw new Error('not an Earlybird weights file (no __metadata__.earlybird)');
  return { header, dataStart: 8 + n, meta };
}

function rawTensor(bytes, st, name) {
  const t = st.header[name]; if (!t) throw new Error('missing tensor ' + name);
  const [a, b] = t.data_offsets, o = bytes.byteOffset + st.dataStart + a;
  if (t.dtype === 'U8') return bytes.subarray(st.dataStart + a, st.dataStart + b);
  if (t.dtype === 'F16') {
    const dv = new DataView(bytes.buffer, o, b - a), out = new Float32Array((b - a) / 2);
    for (let i = 0; i < out.length; i++) out[i] = halfToFloat(dv.getUint16(i * 2, true));
    return out;
  }
  throw new Error(`${name}: unsupported dtype ${t.dtype}`);
}

/** One tensor, float32, as earlybird.py `_unpack` (c * s then + z, both rounded to float32). */
export function unpackTensor(bytes, st, name) {
  const m = st.meta[name]; if (!m) throw new Error('unknown tensor ' + name);
  if (m.bits === 16) return rawTensor(bytes, st, name);
  const q = rawTensor(bytes, st, name + '.q'), s = rawTensor(bytes, st, name + '.s'), z = rawTensor(bytes, st, name + '.z');
  const rows = st.header[name + '.s'].shape[0], groups = st.header[name + '.s'].shape[1], G = m.group, n = m.n;
  const code = m.bits === 4 ? (i) => (i & 1 ? q[i >> 1] >> 4 : q[i >> 1] & 15) : (i) => q[i];
  const out = new Float32Array(rows * n), f = Math.fround;
  for (let r = 0; r < rows; r++) for (let j = 0; j < n; j++) {
    const g = Math.floor(j / G), si = r * groups + g;
    out[r * n + j] = f(f(code(r * n + j) * s[si]) + z[si]);
  }
  return out;
}

/** Fill the external-data buffer an ONNX graph expects, from its manifest (tools/earlybird-export/extmap.py). */
export function buildExternal(bytes, st, manifest, cache = new Map()) {
  const buf = new Uint8Array(manifest.bytes), f32 = new Float32Array(buf.buffer);
  for (const e of manifest.tensors) {
    let v = cache.get(e.src); if (!v) { v = unpackTensor(bytes, st, e.src); cache.set(e.src, v); }
    const o = e.offset / 4, n = e.length / 4;
    if (v.length !== n) throw new Error(`${e.name}: size ${v.length} != ${n}`);
    if (!e.transpose) f32.set(v, o);
    else { const [R, C] = e.shape; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) f32[o + i * C + j] = v[j * R + i]; } // stored [C, R]
  }
  return buf;
}
