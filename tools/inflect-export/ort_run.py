import sys, json, numpy as np, onnxruntime as ort, soundfile as sf
import os
O = os.environ.get('INFLECT_ONNX_OUT', 'out').rstrip('/') + '/'
meta = json.load(open(O+'inflect_meta.json')); vocab = meta['vocab']; V = meta['voices']
styles = np.fromfile(O+'voice_styles_f32.bin', np.float32).reshape(6, 510, 128)
affs = np.fromfile(O+'voice_affines_f32.bin', np.float32).reshape(6, 18432)
so = ort.SessionOptions(); so.intra_op_num_threads = 4
TX = ort.InferenceSession(O+sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith('text') else O+'text.onnx', so)
DC = ort.InferenceSession(O+(sys.argv[2] if len(sys.argv) > 2 else 'decode.onnx'), so)
def speak(phones, voice):
    sid = V.index(voice); ids = [0] + [vocab[c] for c in phones] + [0]
    tok = np.array([ids], np.int64); s = np.array([sid], np.int64)
    dur, feat, asr = TX.run(None, {'tokens': tok, 'sid': s})
    counts = np.maximum(np.round(dur[0]), 1).astype(int); F = counts.sum(); T = len(ids)
    aln = np.zeros((1, T, F), np.float32); aln[0, np.repeat(np.arange(T), counts), np.arange(F)] = 1
    out, = DC.run(None, {'feat': feat, 'asr_tok': asr, 'aln': aln, 'sid': s, 'style': styles[sid, T-3][None], 'affine': affs[sid]})
    return out[0]
if __name__ == '__main__':
    import time
    phones = json.load(open(sys.argv[3] if len(sys.argv) > 3 else 'phones.json'))
    for i, (voice, ph) in enumerate(phones):
        t = time.time(); a = speak(ph, voice); print(voice, len(a)/24000, 's audio in', round(time.time()-t, 2), 's, peak', float(abs(a).max()))
        sf.write(f'ort_{i}_{voice}.wav', a, 24000)
