"""A small stand-in for spaCy, just enough for misaki's English G2P in the browser
(Pyodide has no spaCy wheel). misaki calls spacy.load('en_core_web_sm')(text) and reads
token.text / token.tag_ / token.whitespace_.

Tokenisation follows spaCy's English rules for the cases that matter to misaki
(leading/trailing punctuation, n't / 's / 're / 've / 'll / 'd / 'm, infix hyphens).
Part-of-speech tags come from a few context rules instead of a statistical tagger, so
spelling-identical words with two pronunciations ("I read" / "to read", "live music" /
"they live") follow those rules; tools/kitten-frontend/parity.py measures the
difference against real spaCy + misaki.
"""
from __future__ import annotations

import re
import sys
import types

_SUFFIX = re.compile(r"(?i)^(.+?)(n't|'s|'re|'ve|'ll|'d|'m|’s|’re|’ve|’ll|’d|’m|n’t)$")
_LEAD = "\"“‘'([{¿¡«`"
_TRAIL_CHARS = ".,!?;:…\"”’')]}»"
_SPECIAL = {"gotta": ["got", "ta"], "gonna": ["gon", "na"], "wanna": ["wan", "na"], "cannot": ["can", "not"],
            "can't": ["ca", "n't"], "won't": ["wo", "n't"], "ain't": ["ai", "n't"], "shan't": ["sha", "n't"],
            "let's": ["let", "'s"], "Let's": ["Let", "'s"]}

DT = {"a", "an", "the", "this", "these", "those", "every", "each", "some", "any", "no", "another", "all", "both"}
PRP = {"i", "you", "he", "she", "it", "we", "they", "me", "him", "us", "them", "'s"}
PRPS = {"my", "your", "his", "her", "its", "our", "their"}
MD = {"will", "would", "can", "ca", "could", "should", "may", "might", "must", "shall", "'ll", "'d", "wo", "sha"}
IN = {"in", "on", "at", "by", "of", "for", "with", "from", "about", "over", "under", "than", "per", "into", "onto",
      "through", "during", "before", "after", "without", "within", "like", "upon", "across", "between", "against", "since"}
DO = {"do", "does", "did", "don't", "doesn't", "didn't"}
BE = {"is", "are", "was", "were", "am", "be", "been", "being", "'re", "'m"}
CC = {"and", "or", "but", "nor", "so", "yet"}
RB = {"n't", "not", "never", "always", "often", "just", "also", "very", "really", "almost", "already", "again", "so"}


class Token:
    __slots__ = ("text", "tag_", "whitespace_")

    def __init__(self, text, whitespace):
        self.text, self.whitespace_, self.tag_ = text, whitespace, ""


def _split_word(w):
    """One whitespace-free chunk -> list of token strings."""
    lead, trail = [], []
    while w and w[0] in _LEAD and len(w) > 1:
        lead.append(w[0]); w = w[1:]
    while w:
        if w.endswith("...") and len(w) > 3:
            trail.insert(0, "..."); w = w[:-3]; continue
        if len(w) > 1 and w[-1] in _TRAIL_CHARS and not (w[-1] in "'’" and w[:-1].lower().endswith("s") and False):
            # keep the period of a short abbreviation like "e.g." or "U.S."
            if w[-1] == "." and re.fullmatch(r"(?:[A-Za-z]\.)+", w):
                break
            trail.insert(0, w[-1]); w = w[:-1]; continue
        break
    mid = []
    if w in _SPECIAL:
        mid = list(_SPECIAL[w])
    elif w:
        m = _SUFFIX.match(w)
        if m and m.group(1) and re.search(r"[A-Za-z]", m.group(1)):
            base, suf = m.group(1), m.group(2)
            mid = [base, suf]
        else:
            mid = [w]
        # infix hyphens between letters / digits: well-known -> well - known
        out = []
        for t in mid:
            parts = re.split(r"(?<=[A-Za-z0-9])(-)(?=[A-Za-z0-9])|(—|–)", t)
            out += [p for p in parts if p]
        mid = out
    return lead + mid + trail


def tokenize(text):
    toks = []
    for m in re.finditer(r"(\S+)(\s*)", text):
        parts = _split_word(m.group(1))
        for i, p in enumerate(parts):
            toks.append(Token(p, m.group(2)[:1] if i == len(parts) - 1 and m.group(2) else ""))
    return toks


def _punct_tag(t, prev_tag, quote_open):
    if t in (".", "!", "?"):
        return "."
    if t == ",":
        return ","
    if t in (";", ":", "...", "…", "—", "–", "--"):
        return ":"
    if t == "-":
        return "HYPH"
    if t == "(":
        return "-LRB-"
    if t == ")":
        return "-RRB-"
    if t in ("“",):
        return "``"
    if t in ("”",):
        return "''"
    if t == '"':
        return "''" if quote_open else "``"
    if t == "$":
        return "$"
    return None


def tag(tokens):
    quote_open = False
    prev = None          # previous non-punctuation tag
    first = True
    for i, tk in enumerate(tokens):
        t, lw = tk.text, tk.text.lower()
        nxt = tokens[i + 1].text.lower() if i + 1 < len(tokens) else ""
        pt = _punct_tag(t, prev, quote_open)
        if pt is not None:
            tk.tag_ = pt
            if t == '"':
                quote_open = not quote_open
            elif t in "“":
                quote_open = True
            elif t in "”":
                quote_open = False
            if pt == ".":
                first = True
            continue
        if re.fullmatch(r"[\d.,]+", t) and re.search(r"\d", t):
            tg = "CD"
        elif lw == "'s":
            tg = "POS" if prev in ("NN", "NNP", "NNS") else "VBZ"
            if tokens[i - 1].text.lower() == "let":
                tg = "PRP"
        elif lw == "n't":
            tg = "RB"
        elif len(t) > 1 and t.isupper() and t.isalpha():
            tg = "NNP"
        elif t == "A" and not first:
            tg = "NNP"
        elif lw == "that":
            tg = "IN" if (prev in ("NN", "NNS", "NNP", "VBD", "VBZ", "VBP", "VB") and nxt and nxt[0].isalnum()) or nxt in PRP or nxt in DT else "DT"
        elif lw in DT:
            tg = "DT"
        elif lw in PRP:
            tg = "PRP"
        elif lw in PRPS:
            tg = "PRP$"
        elif lw in MD:
            tg = "MD"
        elif lw == "to":
            tg = "TO"
        elif lw in IN:
            tg = "IN"
        elif lw in CC:
            tg = "CC"
        elif lw in BE:
            tg = {"is": "VBZ", "was": "VBD", "were": "VBD", "be": "VB", "been": "VBN", "being": "VBG"}.get(lw, "VBP")
        elif lw in DO:
            tg = {"does": "VBZ", "did": "VBD"}.get(lw, "VBP")
        elif lw in RB or lw.endswith("ly") and len(lw) > 4:
            tg = "RB"
        elif prev in ("MD", "TO") or (prev == "RB" and i > 1 and tokens[i - 2].tag_ in ("MD", "TO", "VBP", "VBZ", "VBD")) \
                or (prev == "PRP" and tokens[i - 1].text.lower() == "let"):
            tg = "VB"
        elif prev in ("NNP", "NN") and lw.endswith("s") and not lw.endswith("ss") and len(lw) > 3 and nxt in IN | DT | PRPS:
            tg = "VBZ"
        elif prev == "PRP" and tokens[i - 1].text.lower() not in ("me", "him", "us", "them", "'s"):
            tg = "VBD" if lw.endswith("ed") else ("VBZ" if lw.endswith("s") and not lw.endswith("ss") else "VBP")
        elif t[:1].isupper() and not first:
            tg = "NNP"
        elif lw.endswith("ing") and len(lw) > 4:
            tg = "VBG"
        elif lw.endswith("ed") and len(lw) > 3:
            tg = "VBD" if prev not in ("DT", "PRP$", "VBZ", "VBP", "VBD") else "VBN"
        elif prev in ("DT", "PRP$", "JJ", "POS", "IN", "CD"):
            tg = "NNS" if lw.endswith("s") and not lw.endswith("ss") else "NN"
        else:
            tg = "NN"
        tk.tag_ = tg
        prev = tg
        first = False
    return tokens


class _NLP:
    def __call__(self, text):
        return tag(tokenize(text))


def install():
    """Register this module as `spacy` (and the bits misaki touches)."""
    m = types.ModuleType("spacy")
    util = types.ModuleType("spacy.util")
    util.is_package = lambda name: True
    cli = types.ModuleType("spacy.cli")
    cli.download = lambda name: None
    training = types.ModuleType("spacy.training")

    class Alignment:      # only used for misaki's [word](/phonemes/) link syntax
        @staticmethod
        def from_strings(a, b):
            raise NotImplementedError("link syntax is not supported in the browser front end")
    training.Alignment = Alignment
    m.util, m.cli, m.training = util, cli, training
    m.load = lambda name, enable=None, **kw: _NLP()
    sys.modules.update({"spacy": m, "spacy.util": util, "spacy.cli": cli, "spacy.training": training})
    return m
