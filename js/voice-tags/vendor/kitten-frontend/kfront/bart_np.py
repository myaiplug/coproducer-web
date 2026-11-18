"""NumPy forward pass of the 1-layer character BART used as Kitten's last-resort G2P
(PeterReid/graphemes_to_phonemes_en_us, Apache-2.0), so the browser front end needs no
PyTorch / transformers. Greedy decoding, same as transformers generate(num_beams=1,
do_sample=False, max_length=max_position_embeddings) with forced_eos at the last step.
Checked against transformers in tools/kitten-frontend/check_bart.py."""
from __future__ import annotations

import json
import struct

import numpy as np

_DT = {"F32": np.float32, "F16": np.float16}


def load_safetensors(path):
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        head = json.loads(f.read(n))
        buf = f.read()
    out = {}
    for k, v in head.items():
        if k == "__metadata__":
            continue
        a, b = v["data_offsets"]
        out[k] = np.frombuffer(buf[a:b], dtype=_DT[v["dtype"]]).reshape(v["shape"]).astype(np.float32)
    return out


def _erf(x):
    # Abramowitz & Stegun 7.1.26 (|err| < 1.5e-7)
    s = np.sign(x)
    x = np.abs(x)
    t = 1.0 / (1.0 + 0.3275911 * x)
    y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * np.exp(-x * x)
    return s * y


def _gelu(x):
    return 0.5 * x * (1.0 + _erf(x / np.sqrt(2.0)))


def _ln(x, w, b, eps=1e-5):
    m = x.mean(-1, keepdims=True)
    v = ((x - m) ** 2).mean(-1, keepdims=True)
    return (x - m) / np.sqrt(v + eps) * w + b


class BartG2P:
    def __init__(self, weights_path, config):
        self.w = load_safetensors(weights_path)
        self.cfg = config
        self.d = config["d_model"]
        self.heads = config["encoder_attention_heads"]
        self.max_len = config["max_position_embeddings"]
        self.eos = config["eos_token_id"]
        self.start = config["decoder_start_token_id"]

    def _lin(self, x, p):
        return x @ self.w[p + ".weight"].T + self.w[p + ".bias"]

    def _attn(self, x, kv, p, causal):
        h, d = self.heads, self.d
        hd = d // h
        q = self._lin(x, p + ".q_proj") * (hd ** -0.5)
        k = self._lin(kv, p + ".k_proj")
        v = self._lin(kv, p + ".v_proj")
        tq, tk = q.shape[0], k.shape[0]
        q = q.reshape(tq, h, hd).transpose(1, 0, 2)
        k = k.reshape(tk, h, hd).transpose(1, 0, 2)
        v = v.reshape(tk, h, hd).transpose(1, 0, 2)
        s = q @ k.transpose(0, 2, 1)
        if causal:
            s = s + np.triu(np.full((tq, tk), -np.inf, dtype=np.float32), 1)
        s = s - s.max(-1, keepdims=True)
        e = np.exp(s)
        a = e / e.sum(-1, keepdims=True)
        o = (a @ v).transpose(1, 0, 2).reshape(tq, d)
        return self._lin(o, p + ".out_proj")

    def _embed(self, ids, side):
        w = self.w
        x = w["model.shared.weight"][ids] + w[f"model.{side}.embed_positions.weight"][np.arange(len(ids)) + 2]
        return _ln(x, w[f"model.{side}.layernorm_embedding.weight"], w[f"model.{side}.layernorm_embedding.bias"])

    def _ffn(self, x, p):
        return self._lin(_gelu(self._lin(x, p + ".fc1")), p + ".fc2")

    def encode(self, ids):
        p, w = "model.encoder.layers.0", self.w
        x = self._embed(np.asarray(ids), "encoder")
        x = _ln(x + self._attn(x, x, p + ".self_attn", False), w[p + ".self_attn_layer_norm.weight"], w[p + ".self_attn_layer_norm.bias"])
        x = _ln(x + self._ffn(x, p), w[p + ".final_layer_norm.weight"], w[p + ".final_layer_norm.bias"])
        return x

    def decode_step(self, enc, ids):
        p, w = "model.decoder.layers.0", self.w
        x = self._embed(np.asarray(ids), "decoder")
        x = _ln(x + self._attn(x, x, p + ".self_attn", True), w[p + ".self_attn_layer_norm.weight"], w[p + ".self_attn_layer_norm.bias"])
        x = _ln(x + self._attn(x, enc, p + ".encoder_attn", False), w[p + ".encoder_attn_layer_norm.weight"], w[p + ".encoder_attn_layer_norm.bias"])
        x = _ln(x + self._ffn(x, p), w[p + ".final_layer_norm.weight"], w[p + ".final_layer_norm.bias"])
        return x[-1] @ w["model.shared.weight"].T + w["final_logits_bias"][0]

    def generate(self, ids):
        enc = self.encode(ids)
        out = [self.start]
        while len(out) < self.max_len:
            if len(out) == self.max_len - 1:
                out.append(self.eos)
                break
            nxt = int(np.argmax(self.decode_step(enc, out)))
            out.append(nxt)
            if nxt == self.eos:
                break
        return out
