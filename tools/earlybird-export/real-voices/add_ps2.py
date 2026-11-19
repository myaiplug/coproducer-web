import json, os, glob, numpy as np, soundfile as sf, random, hashlib
from scipy.signal import resample_poly
rng = random.Random(99)
def split_of(key, p_tune=0.3): return 'tune' if int(hashlib.md5(key.encode()).hexdigest(), 16) % 100 < p_tune*100 else 'test'
items = [i for i in json.load(open('set/manifest_all.json')) if not i['id'].split('/')[-1].startswith('ps_')]
for f in glob.glob('set/ps_*.f32') + glob.glob('set/m*/ps_*.f32'): os.remove(f)
M = {t: sf.read(f'music/{t}.wav', dtype='float32')[0] for t in ('funkorama', 'acidjazz', 'coldfunk')}
sil = lambda s: (np.random.RandomState(1).randn(int(s*16000)) * 1e-4).astype(np.float32)
for m in json.load(open('ps2/manifest.json')):
    x, sr = sf.read(m['file'], dtype='float32'); g = np.gcd(sr, 16000); x = resample_poly(x, 16000//g, sr//g).astype(np.float32)
    x = (x * 0.05 / (np.sqrt((x**2).mean()) + 1e-9)).astype(np.float32); x = np.clip(np.concatenate([sil(0.25), x, sil(0.3)]), -1, 1).astype('<f4')
    base = os.path.basename(m['file'])[:-4]; sp = split_of('ps:' + m['src_id'].rsplit('_', 1)[0])
    x.tofile(f'set/{base}.f32')
    it = {'id': base, 'cat': 'neg_speech', 'want': None, 'split': sp, 'src': 'peoples_speech', 'spliced': False, 'text': m['text_full'][:80], 'secs': round(len(x)/16000, 2)}
    items.append({**it, 'cond': 'clean'})
    for snr in (10, 5, 0):
        t = rng.choice(list(M)); mu = M[t]; s = rng.randrange(16000*5, len(mu) - len(x) - 1); seg = mu[s:s+len(x)].copy()
        seg *= (0.05 / 10**(snr/20)) / (np.sqrt((seg**2).mean()) + 1e-9)
        np.clip(x + seg, -1, 1).astype('<f4').tofile(f'set/m{snr}/{base}.f32')
        items.append({**it, 'id': f'm{snr}/{base}', 'cond': f'music_snr{snr}', 'music': t})
json.dump(items, open('set/manifest_all.json', 'w'))
json.dump([i for i in items if i['id'].split('/')[-1].startswith('ps2_')], open('set/manifest_ps2.json', 'w'))
json.dump([i for i in items if i['split'] == 'test'], open('set/manifest_test.json', 'w'))
from collections import Counter; print(len(items), len(set(i['id'] for i in items)), Counter((i['cat'], i['split']) for i in items if i['cond'] == 'clean'))
