"""Earlybird-29M -> two ONNX graphs for whole-utterance (push-to-talk) recognition in the browser.
encoder.onnx: audio[1,N] float32 16 kHz -> mem[1,T,320]   (exactly Stream._step from reset: real frames + silence-pad frames)
decoder.onnx: ids[1,L] int64, mem[1,T,320] -> logits[1,L,V]   (no KV cache; commands are a few tokens)
"""
import os, sys, json, re, time, math
sys.path.insert(0, 'model')
import numpy as np, torch, torch.nn.functional as F
from earlybird import Earlybird, load_audio
eb = Earlybird.from_pretrained('model', threads=4)
M = eb.model.requires_grad_(False); enc = M.model.encoder; dec = M.model.decoder; cfg = M.config
H = cfg.num_attention_heads
back = [w[0] for w in cfg.encoder_config.sliding_windows]; ahead = [max(0, w[1]-1) for w in cfg.encoder_config.sliding_windows]
FR = enc.embedder.frame_len

class Enc(torch.nn.Module):
    def forward(self, audio):
        e = enc.embedder
        n = audio.shape[1] // FR
        f = audio[:, : n * FR].reshape(1, -1, FR)
        z = torch.exp(e.comp.log_k) * e.cmvn(f)
        z = torch.sign(z) * torch.log(z.abs() + torch.sqrt(z * z + 1))  # asinh (no ONNX symbolic in torch)
        h = F.silu(e.linear(z)).transpose(1, 2)
        k1, s1 = e.conv1.kernel_size[0], e.conv1.stride[0]
        y = F.silu(F.conv1d(F.pad(h, (k1-1, k1-1)), e.conv1.weight, e.conv1.bias, stride=s1))
        k2, s2 = e.conv2.kernel_size[0], e.conv2.stride[0]
        x = F.conv1d(F.pad(y, (k2-1, k2-1)), e.conv2.weight, e.conv2.bias, stride=s2).transpose(1, 2)
        T = x.shape[1]
        idx = torch.arange(T)
        dist = idx[:, None] - idx[None, :]
        for l, layer in enumerate(enc.layers):
            a = layer.self_attn
            mask = ((dist >= 0) & (dist < back[l])) | ((dist < 0) & (-dist <= ahead[l]))
            hh = layer.input_layernorm(x)
            shp = lambda t: t.view(1, -1, H, a.head_dim).transpose(1, 2)
            q, k, v = shp(a.q_proj(hh)), shp(a.k_proj(hh)), shp(a.v_proj(hh))
            o = F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
            x = x + a.o_proj(o.transpose(1, 2).reshape(1, T, -1))
            x = x + layer.mlp(layer.post_attention_layernorm(x))
        x = enc.final_norm(x)
        return dec.proj(x + dec.pos_emb.weight[:T][None])

def rope(x, pos):
    r = dec.rotary_emb
    fr = pos[:, None].float() * r.inv_freq[None, :]
    cos = torch.stack([fr.cos(), fr.cos()], -1).flatten(-2); sin = torch.stack([fr.sin(), fr.sin()], -1).flatten(-2)
    n = cos.shape[-1]; xr, xp = x[..., :n], x[..., n:]
    rot = torch.stack((-xr[..., 1::2], xr[..., 0::2]), dim=-1).flatten(-2)
    return torch.cat([xr * cos + rot * sin, xp], dim=-1)

class Dec(torch.nn.Module):
    def forward(self, ids, mem):
        x = dec.embed_tokens(ids); L = ids.shape[1]; pos = torch.arange(L)
        causal = torch.ones(L, L, dtype=torch.bool).tril()
        for layer in dec.layers:
            a = layer.self_attn; c = layer.encoder_attn
            shp = lambda t: t.view(1, -1, H, a.head_dim).transpose(1, 2)
            h = layer.input_layernorm(x)
            q, k, v = rope(shp(a.q_proj(h)), pos), rope(shp(a.k_proj(h)), pos), shp(a.v_proj(h))
            o = F.scaled_dot_product_attention(q, k, v, attn_mask=causal)
            x = x + a.o_proj(o.transpose(1, 2).reshape(1, L, -1))
            q = shp(c.q_proj(layer.post_attention_layernorm(x)))
            o = F.scaled_dot_product_attention(q, shp(c.k_proj(mem)), shp(c.v_proj(mem)))
            x = x + c.o_proj(o.transpose(1, 2).reshape(1, L, -1))
            x = x + layer.mlp(layer.final_layernorm(x))
        return M.proj_out(dec.norm(x))

E, D = Enc().eval(), Dec().eval(); E.m = M; D.m = M
BOS, EOS = cfg.decoder_start_token_id, cfg.eos_token_id

def greedy(run_enc, run_dec, x):
    if len(x) / 16000 < 0.24: return []
    mem = run_enc(x); toks = []; max_new = int(len(x) / 16000 * 6.5) + 4
    while len(toks) < max_new:
        lg = run_dec([BOS] + toks, mem)[-1]; t = int(np.argmax(lg))
        if t == EOS: break
        toks.append(t)
    return toks

if __name__ == '__main__':
    Dd = os.environ.get('EB_SAMPLES', 'samples/').rstrip('/') + '/'
    man = json.load(open(Dd+'manifest_inflect.json')) + json.load(open(Dd+'manifest_kitten.json'))
    te = lambda x: E(torch.from_numpy(x)[None])
    td = lambda ids, mem: D(torch.tensor([ids]), mem)[0].numpy()
    same = 0
    with torch.no_grad():
        for m in man:
            x = load_audio(Dd + m['file'])
            mine = eb.tok.decode(greedy(te, td, x), skip_special_tokens=True).strip()
            ref = eb.transcribe(x)
            same += mine == ref
            if mine != ref: print('DIFF', m['file'], mine, '|', ref)
    print('torch reimpl == eb.transcribe on', same, '/', len(man))
    x = load_audio(Dd + man[0]['file'])
    with torch.no_grad():
        a = torch.from_numpy(x)[None]
        torch.onnx.export(E, (a,), 'out/encoder.onnx', input_names=['audio'], output_names=['mem'], dynamic_axes={'audio': {1: 'N'}, 'mem': {1: 'T'}}, opset_version=17, dynamo=False)
        mem = E(a); ids = torch.tensor([[BOS, 100, 200]])
        torch.onnx.export(D, (ids, mem), 'out/decoder.onnx', input_names=['ids', 'mem'], output_names=['logits'], dynamic_axes={'ids': {1: 'L'}, 'mem': {1: 'T'}, 'logits': {1: 'L'}}, opset_version=17, dynamo=False)
    print('exported')
