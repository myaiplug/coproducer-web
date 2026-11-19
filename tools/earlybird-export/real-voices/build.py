import json, os, glob, random, hashlib, subprocess, numpy as np, soundfile as sf
from scipy.signal import resample_poly
random.seed(11); np.random.seed(11)
OUT='set'; os.makedirs(OUT, exist_ok=True)
def split_of(key, p_tune=0.3): return 'tune' if int(hashlib.md5(key.encode()).hexdigest(), 16) % 100 < p_tune*100 else 'test'
def load(path):
    x, sr = sf.read(path, dtype='float32', always_2d=True); x = x.mean(1)
    if sr != 16000: g = np.gcd(sr, 16000); x = resample_poly(x, 16000//g, sr//g).astype(np.float32)
    return x
def opus(path):
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).copy()
def trim(x, thr_db=-35, pad=0.05):
    f = 160; e = np.array([np.sqrt((x[i:i+f]**2).mean()+1e-12) for i in range(0, len(x)-f, f)])
    if not len(e): return x
    on = np.where(20*np.log10(e/e.max()) > thr_db)[0]
    if not len(on): return x
    a = max(0, on[0]*f - int(pad*16000)); b = min(len(x), (on[-1]+1)*f + int(pad*16000)); return x[a:b]
def norm(x, rms=0.05): r = np.sqrt((x**2).mean()) + 1e-9; return (x * rms / r).astype(np.float32)
sil = lambda s: (np.random.randn(int(s*16000)) * 1e-4).astype(np.float32)
items = []
def add(x, id, cat, want, split, src, spliced=False, text=''):
    x = np.concatenate([sil(0.25), x, sil(0.3)]).astype(np.float32)
    np.clip(x, -1, 1, out=x); x.astype('<f4').tofile(f'{OUT}/{id}.f32')
    items.append({'id': id, 'cat': cat, 'want': want, 'split': split, 'src': src, 'spliced': spliced, 'text': text, 'secs': round(len(x)/16000, 2)})
# 1. Speech Commands v2 (CC BY 4.0): every "stop" (positive), 12 each of the other words (negatives)
for m in json.load(open('sc/manifest.json')):
    x = norm(trim(load(m['file']))); sp = split_of('sc:' + m['speaker'])
    if m['word'] == 'stop': add(x, 'sc_' + os.path.basename(m['file'])[3:-4], 'real_word', ['stop', None], sp, 'speech_commands_v2', text='stop')
    else: add(x, 'sc_' + os.path.basename(m['file'])[3:-4], 'neg_word', None, sp, 'speech_commands_v2', text=m['word'])
# 2. MSWC (CC BY 4.0) single words
W = {}
for f in sorted(glob.glob('mswc/*.opus')):
    w, cid = os.path.basename(f)[:-5].split('_common_voice_en_')
    W.setdefault(w, []).append((cid, norm(trim(opus(f)))))
EXPECT = {'play': ['play', None], 'pause': ['pause', None], 'export': ['export', None]}
for w, clips in W.items():
    for cid, x in clips:
        sp = split_of('cv:' + cid)
        if w in EXPECT: add(x, f'mswc_{w}_{cid}', 'real_word', EXPECT[w], sp, 'mswc', text=w)
        elif w in ('mute', 'solo', 'bass', 'drums', 'vocals', 'kick', 'drop'): add(x, f'mswc_{w}_{cid}', 'bare_word', None, sp, 'mswc', text=w)
# 3. spliced commands from MSWC words of different speakers, both words from the same split
STEM = {'bass': 'bass', 'drums': 'drums', 'vocals': 'vocals', 'kick': 'kick', 'snare': 'snare'}
def pick(w, sp):
    c = [x for cid, x in W.get(w, []) if split_of('cv:' + cid) == sp]; return random.choice(c) if c else None
gap = lambda: sil(random.uniform(0.04, 0.12))
n = 0
for sp, N in (('tune', 60), ('test', 140)):
    for k in range(N):
        verb = random.choice(['mute', 'solo', 'drop', 'mute the', 'solo the']); stem = random.choice(['bass', 'drums', 'vocals', 'kick', 'bass', 'drums', 'vocals'])
        if verb == 'drop': verb = 'drop the'; stem = 'bass'
        words = verb.split() + [stem]; parts = [pick(w, sp) for w in words]
        if any(p is None for p in parts): continue
        x = parts[0]
        for p in parts[1:]: x = np.concatenate([x, gap(), p])
        action = 'mute' if verb.startswith(('mute', 'drop')) else 'solo'
        add(x, f'splice_{sp}_{k}', 'spliced_cmd', [f'{action}', STEM[stem]], sp, 'mswc', True, ' '.join(words)); n += 1
# 4. People's Speech windows (CC-BY / CC-BY-SA): natural non-command speech
for m in json.load(open('ps/manifest.json')):
    add(norm(load(m['file'])), 'ps_' + os.path.basename(m['file'])[:-4][-40:], 'neg_speech', None, split_of('ps:' + m['src_id']), 'peoples_speech', text=m['text_full'][:80])
json.dump(items, open(f'{OUT}/manifest.json', 'w'))
from collections import Counter
print(Counter((i['cat'], i['split']) for i in items))
