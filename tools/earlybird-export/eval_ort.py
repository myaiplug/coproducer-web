import os, json, re, sys, time, numpy as np, onnxruntime as ort
sys.path.insert(0, 'model'); from earlybird import load_audio
so = ort.SessionOptions(); so.intra_op_num_threads = 1
ENC = ort.InferenceSession(sys.argv[1] if len(sys.argv) > 1 else 'out/encoder.onnx', so)
DEC = ort.InferenceSession(sys.argv[2] if len(sys.argv) > 2 else 'out/decoder.onnx', so)
G = json.load(open('out/commands.json')); VOC = json.load(open('out/vocab.json')); BOS, EOS = G['bos'], G['eos']
def detok(ids):
    s = ''.join(VOC[i] for i in ids).replace('▁', ' ')
    s = re.sub(r'<0x([0-9A-F]{2})>', lambda m: chr(int(m.group(1), 16)), s)
    return s.strip()
def logsoftmax(x): m = x.max(-1, keepdims=True); return x - m - np.log(np.exp(x - m).sum(-1, keepdims=True))
def dec(ids, mem): return DEC.run(None, {'ids': np.array([ids], np.int64), 'mem': mem})[0][0]
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower()).strip()
def lev(a, b):
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1): p, d[j] = d[j], min(d[j] + 1, d[j-1] + 1, p + (ca != cb))
    return d[-1]
def recognise(x, topk=8):
    if len(x) / 16000 < 0.24: return [], '', 0.0
    mem = ENC.run(None, {'audio': x[None].astype(np.float32)})[0]
    toks, lp = [], 0.0; max_new = int(len(x) / 16000 * 6.5) + 4
    while len(toks) < max_new:
        row = logsoftmax(dec([BOS] + toks, mem)[-1]); t = int(row.argmax()); lp += float(row[t])
        if t == EOS: break
        toks.append(t)
    text = detok(toks); n = norm(text)
    scored = sorted(((lev(n, p['text']) / max(len(n), len(p['text']), 1), i) for i, p in enumerate(G['phrases'])))
    cands = []
    for dist, i in scored[:topk]:
        best = -1e9
        for f in G['phrases'][i]['forms']:
            lg = logsoftmax(dec([BOS] + f, mem)); best = max(best, float(sum(lg[k, t] for k, t in enumerate(f + [EOS]))))
        cands.append((best, dist, i))
    cands.sort(reverse=True)
    return cands, text, lp
def decide(cands, text, lp, margin, maxdist):
    if not cands: return None
    s, dist, i = cands[0]
    if s < lp - margin and dist > maxdist: return None
    return G['phrases'][i]
if __name__ == '__main__':
    D = os.environ.get('EB_SAMPLES', 'samples/').rstrip('/') + '/'
    pos = json.load(open(D+'manifest_inflect.json')) + json.load(open(D+'manifest_kitten.json'))
    neg = json.load(open(D+'manifest_neg_inflect.json')) + json.load(open(D+'manifest_neg_kitten.json'))
    gold = {p['text']: (p['action'], p['stem']) for p in G['phrases']}
    t0 = time.time(); R = []
    for m in pos + neg:
        c, text, lp = recognise(load_audio(D + m['file'])); R.append((m, c, text, lp))
    print('secs per clip', round((time.time() - t0) / len(R), 3))
    json.dump([(m, c, t, l) for m, c, t, l in R], open('eb_ort_raw.json', 'w'))
    print('raw transcript exact (positives):', sum(norm(t) == m['text'] for m, c, t, l in R if m in pos), '/', len(pos))
    for margin in (3, 5, 8, 12):
        for maxdist in (0.3, 0.45):
            ok = fa = 0; wrong = []
            for m, c, t, l in R:
                d = decide(c, t, l, margin, maxdist)
                if m in pos:
                    if d and (d['action'], d['stem']) == gold[m['text']]: ok += 1
                    else: wrong.append((m['file'], m['text'], t, d and d['text']))
                elif d: fa += 1
            print(f'margin {margin} maxdist {maxdist}: correct action {ok}/{len(pos)}, false accepts {fa}/{len(neg)}')
    print(wrong[:30])
