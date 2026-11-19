"""Kitten TTS 2 Mini English text front end for the browser (Pyodide).

The KittenML front-end modules (english.py, tts_norm.py, phonemize_v1.py,
phonemize_v2.py, frontend_init.py = frontend/__init__.py) are copied unchanged from
github.com/KittenML/KittenTTS (Apache-2.0). Two things are swapped so it runs without
PyTorch, transformers or spaCy:
  * the BART fallback runs in NumPy (bart_np.py, decodes identically to transformers);
  * spaCy is replaced by spacy_stub.py (rule-based tokeniser + tagger).
"""
from __future__ import annotations

import json
import os
import re

from . import spacy_stub

spacy_stub.install()

from . import english  # noqa: E402
from .bart_np import BartG2P  # noqa: E402


def _np_fallback_init(self, model_dir, cmu_lexicon):
    with open(cmu_lexicon, encoding="utf-8") as f:
        self.cmu = json.load(f)
    with open(os.path.join(model_dir, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    self.model = BartG2P(os.path.join(model_dir, "model.safetensors"), cfg)
    self.g2i = {c: i for i, c in enumerate(cfg["grapheme_chars"]) if i > 3}
    self.i2p = {i: c for i, c in enumerate(cfg["phoneme_chars"]) if i > 3}
    self.max_len = cfg["max_position_embeddings"]
    letters = re.escape("".join(self.g2i))
    self._pieces = re.compile(rf"(\d+)|([{letters}]+)|(.)", re.S)
    self._memo = {}
    self.used, self.skipped = [], []


def _np_bart(self, word):
    if word not in self._memo:
        out = []
        step = self.max_len - 2
        for i in range(0, len(word), step):
            ids = [1] + [self.g2i[c] for c in word[i:i + step]] + [2]
            gen = self.model.generate(ids)
            out.append("".join(self.i2p.get(int(t), "") for t in gen))
        self._memo[word] = "".join(out).replace("ɾ", "T").replace("ʔ", "t")
    return self._memo[word]


english.Fallback.__init__ = _np_fallback_init
english.Fallback._bart = _np_bart

from .frontend_init import Frontend  # noqa: E402

_FRONTENDS = {}


def get_frontend(repo_dir):
    if repo_dir not in _FRONTENDS:
        with open(os.path.join(repo_dir, "config.json"), encoding="utf-8") as f:
            cfg = json.load(f)
        with open(os.path.join(repo_dir, cfg.get("vocab", "vocab.json")), encoding="utf-8") as f:
            vocab = json.load(f)
        _FRONTENDS[repo_dir] = (Frontend(cfg.get("phonemizer", "v1"), vocab,
                                         os.path.join(repo_dir, cfg.get("g2p_dir", "g2p"))), vocab)
    return _FRONTENDS[repo_dir]


def phonemize(repo_dir, text):
    """text -> {'chunks': [phoneme strings], 'fallback': [...], 'skipped': [...]}"""
    fe, _ = get_frontend(repo_dir)
    chunks, rep = fe(text, "en")
    return {"chunks": chunks, "fallback": [list(x) for x in rep.fallback], "skipped": list(rep.skipped)}
