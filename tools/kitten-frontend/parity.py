#!/usr/bin/env python3
"""Compare the browser front end (js/voice-tags/vendor/kitten-frontend, spaCy stub + NumPy BART) with
KittenML's own front end (real spaCy + PyTorch BART) on the same sentences.

  pip install "kittenml==0.9.7" en_core_web_sm  (Python 3.10-3.12)  # the reference
  python parity.py --repo /path/to/kitten-tts-2-mini producer_lines.txt [--wiki Jazz Vinyl_record] [-v]

--repo is a local copy of huggingface.co/KittenML/kitten-tts-2-mini (config.json, vocab.json, g2p/).
--wiki adds sentences from those English Wikipedia articles (fetched, not stored).
Each front end runs in its own process because the stub replaces the `spacy` module.
"""
import argparse, difflib, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "..", "..", "js", "voice-tags", "vendor", "kitten-frontend")

REF = """
import json, sys
from kittenml.kittentts2_tiny.model import KittenTTS2Tiny
m = KittenTTS2Tiny(sys.argv[1], backend="cpu")
lines = json.load(open(sys.argv[2]))
json.dump([m.phonemize(s, "en") for s in lines], open(sys.argv[3], "w"), ensure_ascii=False)
"""
WEB = """
import json, sys
sys.path.insert(0, sys.argv[4])
import kfront
lines = json.load(open(sys.argv[2]))
json.dump([kfront.phonemize(sys.argv[1], s)["chunks"] for s in lines], open(sys.argv[3], "w"), ensure_ascii=False)
"""


def wiki(title, n=50):
    u = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=" + urllib.parse.quote(title)
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "coproducer-kitten-parity/1"})))
    t = re.sub(r"\s+", " ", re.sub(r"==+[^=]+==+", " ", next(iter(d["query"]["pages"].values()))["extract"]))
    return [x.strip() for x in re.split(r"(?<=[.!?])\s+", t) if 25 < len(x.strip()) < 220][:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--wiki", nargs="*", default=[])
    ap.add_argument("-v", action="store_true")
    a = ap.parse_args()
    lines = [l.strip() for f in a.files for l in open(f, encoding="utf-8") if l.strip()]
    for t in a.wiki:
        lines += wiki(t)
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "lines.json")
        json.dump(lines, open(src, "w"), ensure_ascii=False)
        out = {}
        for name, code in (("ref", REF), ("web", WEB)):
            out[name] = os.path.join(d, name + ".json")
            subprocess.run([sys.executable, "-c", code, a.repo, src, out[name], os.path.abspath(VENDOR)], check=True)
        ref, web = (json.load(open(out[k])) for k in ("ref", "web"))
    same = wt = wd = 0
    for s, x, y in zip(lines, ref, web):
        same += x == y
        xs, ys = " ".join(x).split(), " ".join(y).split()
        sm = difflib.SequenceMatcher(a=xs, b=ys)
        wt += len(xs)
        wd += len(xs) - sum(m.size for m in sm.get_matching_blocks())
        if a.v and x != y:
            print("TEXT", s, "\n REF", " ".join(x), "\n WEB", " ".join(y))
    print(f"sentences identical {same}/{len(lines)}; words differing {wd}/{wt} = {100 * wd / max(wt, 1):.2f}%")


if __name__ == "__main__":
    main()
