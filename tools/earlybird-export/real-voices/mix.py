import json, numpy as np, soundfile as sf, random, os
random.seed(5)
M = [sf.read(f'music/{t}.wav', dtype='float32')[0] for t in ('funkorama', 'acidjazz', 'coldfunk')]
items = json.load(open('set/manifest.json')); out = []
for snr in (10, 5, 0):
    os.makedirs(f'set/m{snr}', exist_ok=True)
    for it in items:
        if it['cat'] == 'bare_word': continue
        x = np.fromfile(f"set/{it['id']}.f32", np.float32); ti = random.randrange(3); m = M[ti]
        s = random.randrange(16000 * 5, len(m) - len(x) - 1); seg = m[s:s+len(x)].copy()
        seg *= (0.05 / 10**(snr/20)) / (np.sqrt((seg**2).mean()) + 1e-9)
        y = np.clip(x + seg, -1, 1).astype('<f4'); y.tofile(f"set/m{snr}/{it['id']}.f32")
        out.append({**it, 'id': f"m{snr}/{it['id']}", 'cond': f'music_snr{snr}', 'music': ['funkorama', 'acidjazz', 'coldfunk'][ti]})
for it in items: it['cond'] = 'clean'
json.dump(items + out, open('set/manifest_all.json', 'w')); print(len(items), len(out))
