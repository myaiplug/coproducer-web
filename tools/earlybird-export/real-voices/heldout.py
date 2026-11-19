import sys
from tune import *
from collections import defaultdict
P = dict(D=0.15, M=8, M1=4, C=0, S=-1e9)
def table(ex):
    t = defaultdict(lambda: [0, 0, 0, 0])
    for r in R:
        m = man[r['id']]
        if m['split'] != 'test': continue
        d = None
        if r['cands'] and (decide(r) if ex is None else ex(r, r['cands'][0])):
            p = G[r['cands'][0]['t']]; d = [p['action'], p['stem']]
        s = t[(m['cat'], m['cond'])]; s[0] += 1
        if m['want']: s[1] += d == m['want']; s[2] += bool(d) and d != m['want']
        else: s[3] += bool(d)
    return t
show(table(None), 'OLD rule, test split'); show(table(rule(P)), 'NEW rule, test split')
