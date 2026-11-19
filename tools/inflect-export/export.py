"""Export Inflect Mini v3 (native33) to two ONNX graphs for the browser.
text.onnx : tokens[1,T] int64, sid[1] int64 -> dur[1,T], feat[1,C,T], asr_tok[1,512,T]
decode.onnx: feat[1,C,T], asr_tok[1,512,T], aln[1,T,F], sid[1], style[1,128], affine[18432] -> audio[1,600F]
"""
import sys, json, importlib.util, numpy as np, torch
from pathlib import Path
import os
ROOT = Path(os.environ.get('INFLECT_DIR', 'Inflect-Mini-v3')).resolve() / 'core'  # the downloaded owensong/Inflect-Mini-v3 repo
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('_sel', ROOT/'synthesize.py'); S = importlib.util.module_from_spec(spec); sys.modules['_sel']=S; spec.loader.exec_module(S)
cli, raw, _ = S.load_selected('mini', 'cpu', 'base', root=ROOT)
model = raw[2].base if hasattr(raw[2], 'base') else raw[2]
import native_mini_inference as mini
from torch.nn.utils.rnn import pack_padded_sequence
OUT = Path(os.environ.get('INFLECT_ONNX_OUT', 'out')).resolve(); OUT.mkdir(exist_ok=True)
text = model.text

class TextNet(torch.nn.Module):
    def __init__(s): super().__init__(); s.m = text
    def forward(s, tokens, sid):
        m = s.m; T = tokens.shape[1]
        lengths = torch.full((1,), T, dtype=torch.long)
        mask = torch.zeros_like(tokens, dtype=torch.bool)
        style = m.speaker_embedding(sid)
        bert = m.bert(tokens, attention_mask=torch.ones_like(tokens, dtype=torch.int32))
        enc = m.bert_encoder(bert).transpose(-1, -2)
        feat = m.predictor.text_encoder(enc, style, lengths, mask)
        hidden, _ = m.predictor.lstm(feat)
        dur = torch.sigmoid(m.predictor.duration_proj(hidden)).sum(-1)
        th = m.text_encoder(tokens, lengths, mask)
        asr_tok = m.asr_proj(th.transpose(1, 2)).transpose(1, 2)
        return dur, feat.transpose(1, 2), asr_tok

# AdaIN fc registry, in a fixed order, so per-voice affine biases are one flat input vector.
reg = [(n, mm.fc) for n, mm in model.generator.named_modules() if type(mm).__name__ == 'AdaIN1d']
sizes = [fc.out_features for _, fc in reg]; assert sum(sizes) == 18432
class DecodeNet(torch.nn.Module):
    def __init__(s): super().__init__(); s.text = text; s.bridge = model.bridge; s.gen = model.generator; s.cur = None
    def forward(s, feat, asr_tok, aln, sid, style, affine):
        sstyle = s.text.speaker_embedding(sid)
        f0, noise = s.text.predictor.F0Ntrain(feat @ aln, sstyle)
        asr = asr_tok @ aln
        hidden = s.bridge.forward_hidden(asr, f0, noise, sid)
        s.cur = affine
        return s.gen(hidden, style, f0).reshape(1, -1)
from kokoro.custom_stft import CustomSTFT
model.generator.stft = CustomSTFT(filter_length=20, hop_length=5, win_length=20)
class ManualIN(torch.nn.Module):
    def __init__(s, src):
        super().__init__(); s.eps = src.eps; s.weight = src.weight; s.bias = src.bias
    def forward(s, x):
        m = x.mean(-1, keepdim=True); v = ((x - m) ** 2).mean(-1, keepdim=True)
        y = (x - m) / torch.sqrt(v + s.eps)
        if s.weight is not None: y = y * s.weight[None, :, None] + s.bias[None, :, None]
        return y
def swap_in(root):
    for name, mod in list(root.named_modules()):
        for cn, ch in list(mod.named_children()):
            if isinstance(ch, torch.nn.InstanceNorm1d):
                assert not ch.track_running_stats
                setattr(mod, cn, ManualIN(ch))
dec = DecodeNet()
off = 0
for (name, fc), n in zip(reg, sizes):
    def hook(mod, args, out, a=off, b=off+n): return out + dec.cur[a:b][None]
    fc.register_forward_hook(hook); off += n

def check_text():
    tn = TextNet().eval()
    ids = model.phoneme_ids('hˈɛloʊ wˈɜɹld. ðɪs ɪz ɐ tˈɛst.')
    tok = torch.tensor([ids]); sid = torch.tensor([0])
    with torch.no_grad():
        d, f, a = tn(tok, sid)
        ref = mini_ref = model.text(tok, torch.tensor([len(ids)]), speaker_ids=sid)[0]
    print('dur maxdiff vs reference', float((d - ref).abs().max()))
    return tn, tok, sid

def voice_tables():
    styles = model.styles; V = mini.VOICES
    tab = np.zeros((6, 510, 128), np.float32); aff = np.zeros((6, 18432), np.float32)
    for i, v in enumerate(V):
        tab[i] = (styles['banks'][mini.DONORS[i]] + styles['offsets'][i] * styles['strengths'][i]).numpy()
        r = styles['affines'][v]
        if r['biases_by_module']:
            aff[i] = np.concatenate([(r['strength'] * r['biases_by_module'][n]).numpy() for n, _ in reg])
    return tab, aff

if __name__ == '__main__':
    tn, tok, sid = check_text()
    torch.onnx.export(tn, (tok, sid), OUT/'text.onnx', input_names=['tokens', 'sid'], output_names=['dur', 'feat', 'asr_tok'],
                      dynamic_axes={'tokens': {1: 'T'}, 'dur': {1: 'T'}, 'feat': {2: 'T'}, 'asr_tok': {2: 'T'}}, opset_version=17, dynamo=False)
    with torch.no_grad(): d, f, a = tn(tok, sid)
    counts = d.round().clamp(min=1).long()[0]; F = int(counts.sum()); T = tok.shape[1]
    aln = torch.zeros(1, T, F); idx = torch.repeat_interleave(torch.arange(T), counts); aln[0, idx, torch.arange(F)] = 1
    tab, aff = voice_tables()
    style = torch.from_numpy(tab[0, T-3])[None]; affine = torch.from_numpy(aff[0])
    with torch.no_grad(): ref_audio = dec(f, a, aln, sid, torch.from_numpy(voice_tables()[0][0, tok.shape[1]-3])[None], torch.from_numpy(voice_tables()[1][0]))
    swap_in(dec)
    torch.onnx.export(dec.eval(), (f, a, aln, sid, style, affine), OUT/'decode.onnx',
                      input_names=['feat', 'asr_tok', 'aln', 'sid', 'style', 'affine'], output_names=['audio'],
                      dynamic_axes={'feat': {2: 'T'}, 'asr_tok': {2: 'T'}, 'aln': {1: 'T', 2: 'F'}, 'audio': {1: 'S'}}, opset_version=17, dynamo=False)
    tab.astype(np.float32).tofile(OUT/'voice_styles_f32.bin'); aff.astype(np.float32).tofile(OUT/'voice_affines_f32.bin')
    json.dump({'vocab': model.vocab, 'voices': list(mini.VOICES), 'max_frames': model.max_frames}, open(OUT/'inflect_meta.json', 'w'), ensure_ascii=False)
    print('exported')
