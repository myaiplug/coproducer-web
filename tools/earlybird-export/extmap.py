"""Make the Earlybird ONNX graphs load their big weights from the original HF file (earlybird.safetensors, 4-bit)
instead of us hosting a re-export. Every large initializer must equal (bit-for-bit, after the same unpacking the
browser does) a tensor of the unpacked state dict, or its transpose. Those are stripped from the .onnx and listed in
a manifest; small leftovers (rope tables, masks, norms) stay inside the graph."""
import sys, json, numpy as np, onnx, torch
from onnx import numpy_helper
sys.path.insert(0, 'model'); from earlybird import _unpack
sd = {k: v.numpy().astype(np.float32) for k, v in _unpack('model/earlybird.safetensors').items()}
by_shape = {}
for k, v in sd.items(): by_shape.setdefault(v.shape, []).append(k); by_shape.setdefault(v.T.shape if v.ndim == 2 else None, []).append(k)
def find(a):
    for k in by_shape.get(a.shape, []):
        v = sd[k]
        if v.shape == a.shape and np.array_equal(v, a): return k, False
        if v.ndim == 2 and v.T.shape == a.shape and np.array_equal(v.T, a): return k, True
    return None, None
for name in ['encoder', 'decoder']:
    m = onnx.load(f'out/{name}.onnx'); g = m.graph; ext = []; kept = 0; keep_bytes = 0
    from onnx.external_data_helper import set_external_data
    off = 0
    for init in g.initializer:
        a = numpy_helper.to_array(init)
        if a.dtype == np.float32 and a.size >= 4096:
            src, tr = find(a)
            if src is None: raise SystemExit(f'{name}: no source for {init.name} {a.shape}')
            n = a.size * 4
            ext.append({'name': init.name, 'src': src, 'transpose': tr, 'shape': list(a.shape), 'offset': off, 'length': n})
            set_external_data(init, location=f'{name}.weights.bin', offset=off, length=n)
            init.ClearField('raw_data'); init.data_location = onnx.TensorProto.EXTERNAL
            off += n
            continue
        kept += 1; keep_bytes += a.nbytes
    onnx.save(m, f'out/{name}_graph.onnx')
    json.dump({'file': f'{name}.weights.bin', 'bytes': off, 'tensors': ext}, open(f'out/{name}_weights.json', 'w'))
    # reference buffer for the Python parity check (never shipped)
    buf = np.zeros(off // 4, np.float32)
    for e in ext:
        v = sd[e['src']]; v = v.T if e['transpose'] else v
        buf[e['offset'] // 4: (e['offset'] + e['length']) // 4] = np.ascontiguousarray(v).ravel()
    buf.tofile(f'out/{name}.weights.bin')
    print(name, 'external', len(ext), 'kept', kept, f'{keep_bytes/1e6:.2f} MB inside graph')
