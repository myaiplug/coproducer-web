"""Stream MSWC en test shards (CC BY 4.0) and keep only clips of the needed keywords. Nothing but kept clips touches disk."""
import tarfile, urllib.request, os, sys, json
from collections import Counter
WANT = {1: ['bass'], 2: ['drop', 'drums'], 3: ['export'], 4: ['guitar'], 5: ['kick'], 6: ['mute', 'pause'], 7: ['play'],
        8: ['snare', 'solo'], 9: ['the'], 10: ['vocals']}
CAP = int(os.environ.get('CAP', '40'))
U = 'https://huggingface.co/datasets/MLCommons/ml_spoken_words/resolve/main/data/opus/en/test/audio/{}.tar.gz'
got = Counter(); streamed = 0
class Count:
    def __init__(s, r): s.r = r
    def read(s, n=-1):
        global streamed; b = s.r.read(n); streamed += len(b); return b
for shard, words in WANT.items():
    last = max(words); r = urllib.request.urlopen(U.format(shard))
    with tarfile.open(fileobj=Count(r), mode='r|gz') as tf:
        for m in tf:
            if not m.isfile(): continue
            w = m.name.lstrip('./').split('_common_voice_')[0]
            if w > last: break
            if w in words and got[w] < CAP:
                open(f'mswc/{os.path.basename(m.name)}', 'wb').write(tf.extractfile(m).read()); got[w] += 1
    r.close(); print(shard, dict(got), f'{streamed/1e6:.0f} MB streamed', flush=True)
json.dump({'counts': got, 'streamed_bytes': streamed}, open('mswc/_stream_log.json', 'w'))
