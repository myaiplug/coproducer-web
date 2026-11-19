import json, itertools, sys
exec(open('analyze.py').read().split("if __name__")[0].replace("sys.argv[1]", "'browser_all.jsonl'"))
def feats(r):
    c = r['cands'][0]; c2 = r['cands'][1] if len(r['cands']) > 1 else {'s': -1e9}
    return dict(gap=c['s'] - r['lp'], d=c['d'], s=c['s'], conf=c['s'] - c2['s'], words=len(c['t'].split()), empty=not r['text'].strip())
def rule(P):
    def ex(r, c):
        f = feats(r)
        if f['empty']: return False
        if f['d'] <= P['D']: return f['conf'] >= P['C']
        M = P['M1'] if f['words'] == 1 else P['M']
        return f['gap'] >= -M and f['conf'] >= P['C'] and f['s'] >= P['S']
    return ex
def evaluate(RR, P):
    ok = wrong = fa = npos = nneg = 0
    for r in RR:
        m = man[r['id']]
        d = None
        if r['cands'] and rule(P)(r, r['cands'][0]): p = G[r['cands'][0]['t']]; d = [p['action'], p['stem']]
        if m['want']:
            npos += 1; ok += d == m['want']; wrong += bool(d) and d != m['want']
        else: nneg += 1; fa += bool(d)
    return ok, npos, wrong, fa, nneg
if __name__ == '__main__':
    tune = [r for r in R if man[r['id']]['split'] == 'tune']
    best = []
    for D, M, M1, C, S in itertools.product([0.0, 0.15, 0.3], [4, 6, 8, 12, 16], [0, 1, 2, 3, 4, 6, 8, 12], [0, 1, 2, 3, 5], [-1e9, -8, -6, -4, -3]):
        P = dict(D=D, M=M, M1=M1, C=C, S=S); ok, npos, wrong, fa, nneg = evaluate(tune, P)
        best.append((ok/npos - 3*wrong/npos - fa/nneg, ok, npos, wrong, fa, nneg, P))
    best.sort(key=lambda x: -x[0])
    base = evaluate(tune, dict(D=0.3, M=12, M1=12, C=-1e9, S=-1e9))
    print('current rule on tune (approx, + empty-reject):', base)
    for b in best[:12]: print(round(b[0], 3), b[1:])
