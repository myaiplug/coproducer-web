import json, sys, os
from collections import defaultdict
man = {m['id']: m for m in json.load(open('set/manifest_all.json'))}
R = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
G = {p['text']: p for p in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../js/voice-commands/model/commands.json')))['phrases']}
def decide(r, margin=12, maxdist=0.3, extra=None):
    if not r['cands']: return None
    c = r['cands'][0]
    if c['s'] < r['lp'] - margin and c['d'] > maxdist: return None
    if extra and not extra(r, c): return None
    p = G[c['t']]; return [p['action'], p['stem']]
def score(R, **kw):
    t = defaultdict(lambda: [0, 0, 0, 0])  # n, correct, wrong_action, accepted(for negatives)
    for r in R:
        m = man[r['id']]; k = (m['cat'], m['cond']); d = decide(r, **kw); s = t[k]; s[0] += 1
        if m['want']:
            if d and d[0] == m['want'][0] and d[1] == m['want'][1]: s[1] += 1
            elif d: s[2] += 1
        elif d: s[3] += 1
    return t
def show(t, title=''):
    print(title)
    for k in sorted(t):
        n, c, w, a = t[k]
        if k[0] in ('real_word', 'spliced_cmd'): print(f'  {k[0]:12s} {k[1]:13s} correct {c}/{n} ({100*c/n:.1f}%)  wrong-action {w}  rejected {n-c-w}')
        else: print(f'  {k[0]:12s} {k[1]:13s} false-accepts {a}/{n} ({100*a/n:.1f}%)')
if __name__ == '__main__':
    split = sys.argv[2] if len(sys.argv) > 2 else None
    RR = [r for r in R if (not split or man[r['id']]['split'] == split)]
    show(score(RR), f'{len(RR)} clips, split={split}, current rule (margin 12, dist 0.3)')
