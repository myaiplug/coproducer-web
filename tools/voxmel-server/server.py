#!/usr/bin/env python3
"""VoxMel voice-cloning server for the CoProducer Voice Tags page.

Runs VoxMel (VoxDance-Lab, code and weights Apache-2.0; trained on Emilia, which is
CC BY-NC 4.0, see README.md) on YOUR computer and answers the page at
http://127.0.0.1:1920. Nothing is uploaded anywhere: the page sends the reference clip
and the text to this process only.

First run downloads, at pinned versions, into --cache (default ~/.cache/coproducer-voxmel):
  * the VoxMel source at commit VOXMEL_COMMIT (GitHub archive; its Qwen tokenizer and
    model configs are needed at load time),
  * VoxMel-0.3B (1.25 GB) or VoxMel-0.6B (2.8 GB) from Hugging Face,
  * Vocos mel 24 kHz (charactr, MIT, 54 MB).

API (JSON in, JSON or WAV out; CORS limited to --allow-origin):
  GET  /v1/health                 -> {"ok": true, "model": ..., "device": ..., "loaded": bool}
  POST /v1/transcribe             {"reference_wav": base64 WAV} -> {"text": ...}   (Whisper, local)
  POST /v1/audio/speech           {"input": text, "reference_wav": base64 WAV, "reference_text": exact
                                   transcript, "seed": int?, "cfg_text_strength": float?, "cfg_spk_strength":
                                   float?} -> audio/wav (24 kHz mono, 16-bit), header x-seed
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import random
import re
import shutil
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VOXMEL_COMMIT = "1b0bc1cc63155b0197825178e896b63f7c0c554c"
VOXMEL_ARCHIVE = f"https://codeload.github.com/VoxDance-Lab/VoxMel/zip/{VOXMEL_COMMIT}"
MODELS = {
    "0.3B": {"repo": "VoxDance-Lab/VoxMel-0.3B", "revision": "8a9b893d35bf575eda1b0380e984cb99fe333ae7",
             "checkpoint": "model_M_final.pt",
             "sha256": "d14b36e255a4b79fbece9f911db99f7ecbf1f25abe6bf19b90202546d41b338a"},
    "0.6B": {"repo": "VoxDance-Lab/VoxMel-0.6B", "revision": "6450fc40bda9c49239f7d249510cd94c9ff89672",
             "checkpoint": "model_L_final.pt", "sha256": None},
}
VOCOS = {"repo": "charactr/vocos-mel-24khz", "revision": "0feb3fdd929bcd6649e0e7c5a688cf7dd012ef21",
         "files": {"config.yaml": None,
                   "pytorch_model.bin": "97ec976ad1fd67a33ab2682d29c0ac7df85234fae875aefcc5fb215681a91b2a"}}
DEFAULT_ORIGINS = ["https://myaiplug.github.io", "http://localhost", "http://127.0.0.1"]
MAX_BODY = 40 * 1024 * 1024          # a 60 s 48 kHz stereo WAV is about 11 MB, base64 adds a third
MAX_TEXT = 400
MAX_REF_SECONDS = 30.0


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(chunk), b""):
            h.update(b)
    return h.hexdigest()


def fetch_source(cache: Path) -> Path:
    """VoxMel checkout at the pinned commit (code + examples/voxmel tokenizer/configs)."""
    root = cache / f"VoxMel-{VOXMEL_COMMIT}"
    if (root / "voxcore").is_dir() and (root / "examples/voxmel/qwen_tokenizer").is_dir():
        return root
    log("downloading VoxMel source", VOXMEL_COMMIT[:12])
    cache.mkdir(parents=True, exist_ok=True)
    data = urllib.request.urlopen(VOXMEL_ARCHIVE, timeout=120).read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        tmp = Path(tempfile.mkdtemp(dir=cache))
        z.extractall(tmp)
        (tmp / f"VoxMel-{VOXMEL_COMMIT}").rename(root)
        shutil.rmtree(tmp, ignore_errors=True)
    return root


def fetch_hf(repo, revision, filename, dest: Path, sha256=None) -> Path:
    from huggingface_hub import hf_hub_download
    p = Path(hf_hub_download(repo, filename, revision=revision, cache_dir=str(dest)))
    if sha256 and sha256_file(p) != sha256:
        raise RuntimeError(f"{repo}/{filename}: checksum mismatch")
    return p


def fetch_models(cache: Path, size: str):
    m = MODELS[size]
    hub = cache / "hf"
    log(f"checking VoxMel-{size} weights (first run downloads them)")
    cfg = fetch_hf(m["repo"], m["revision"], "config.yaml", hub)
    ckpt = fetch_hf(m["repo"], m["revision"], m["checkpoint"], hub, m["sha256"])
    exp = cache / f"exp-{size}-{m['revision'][:12]}"
    exp.mkdir(parents=True, exist_ok=True)
    for src, name in ((cfg, "config.yaml"), (ckpt, m["checkpoint"])):
        dst = exp / name
        if not dst.exists():
            try:
                os.link(src.resolve(), dst)
            except OSError:
                shutil.copy2(src.resolve(), dst)
    voc = cache / f"vocos-mel-24khz-{VOCOS['revision'][:12]}"
    voc.mkdir(parents=True, exist_ok=True)
    for name, sha in VOCOS["files"].items():
        dst = voc / name
        if not dst.exists():
            src = fetch_hf(VOCOS["repo"], VOCOS["revision"], name, hub, sha)
            shutil.copy2(src.resolve(), dst)
    return exp, m["checkpoint"], voc


class Engine:
    def __init__(self, args):
        self.args = args
        self.model = None
        self.whisper = None
        self.lock = threading.Lock()
        self.device = None

    def load(self):
        if self.model is not None:
            return self.model
        a = self.args
        cache = Path(a.cache).expanduser()
        src = fetch_source(cache) if not a.voxmel_src else Path(a.voxmel_src)
        exp, ckpt, voc = (Path(a.model_dir), a.checkpoint, Path(a.vocos_dir)) if a.model_dir else fetch_models(cache, a.size)
        sys.path.insert(0, str(src))
        import torch
        if a.threads:
            torch.set_num_threads(a.threads)
        from voxcore import VoxMel
        ex = src / "examples" / "voxmel"
        cwd = os.getcwd()
        os.chdir(ex)                       # the experiment config names its LLM config relative to here
        try:
            t = time.time()
            self.model = VoxMel.from_pretrained(str(exp), checkpoint=ckpt, tokenizer_path=str(ex / "qwen_tokenizer"),
                                                vocos_path=str(voc), device=a.device)
        finally:
            os.chdir(cwd)
        self.device = str(self.model.device)
        log(f"VoxMel-{a.size} ready on {self.device} in {time.time() - t:.1f} s")
        return self.model

    def transcribe(self, wav_path):
        import whisper                     # openai-whisper (MIT), listed in VoxMel's requirements
        if self.whisper is None:
            self.whisper = whisper.load_model(self.args.whisper, device="cpu" if self.device in (None, "cpu", "mps") else self.device)
        r = self.whisper.transcribe(str(wav_path), language="en" if self.args.whisper.endswith(".en") else None, fp16=False)
        return r.get("text", "").strip()

    def speak(self, text, ref_path, ref_text, seed, cfg_text, cfg_spk):
        m = self.load()
        kw = dict(seed=seed)
        if cfg_text is not None:
            kw["cfg_text_strength"] = float(cfg_text)
        if cfg_spk is not None:
            kw["cfg_spk_strength"] = float(cfg_spk)
        if ref_path is not None:
            kw.update(prompt_wav_path=str(ref_path), prompt_text=ref_text)
        return m.generate(text, **kw), m.sample_rate


def read_reference(b64: str, tmpdir: Path) -> Path:
    import soundfile as sf
    raw = base64.b64decode(b64.split(",", 1)[-1], validate=False)
    data, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=True)
    if data.shape[0] / sr > MAX_REF_SECONDS:
        data = data[: int(MAX_REF_SECONDS * sr)]
    if data.shape[0] / sr < 1.0:
        raise ValueError("the reference clip must be at least 1 second long")
    p = tmpdir / f"ref-{hashlib.sha256(raw).hexdigest()[:16]}.wav"
    if not p.exists():
        sf.write(p, data.mean(axis=1), sr, subtype="PCM_16")
    return p


def wav_bytes(audio, sr):
    import numpy as np
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, np.clip(np.asarray(audio, dtype="float32"), -1, 1), sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def make_handler(engine: Engine, origins, tmpdir: Path):
    def origin_ok(o):
        if not o:
            return False
        if "*" in origins:
            return True
        return any(o == x or (x.startswith("http://") and re.fullmatch(re.escape(x) + r"(:\d+)?", o)) for x in origins)

    class H(BaseHTTPRequestHandler):
        server_version = "coproducer-voxmel/1"

        def log_message(self, fmt, *a):
            log(self.address_string(), fmt % a)

        def _cors(self):
            o = self.headers.get("Origin")
            if origin_ok(o):
                self.send_header("Access-Control-Allow-Origin", o)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "content-type")
                self.send_header("Access-Control-Expose-Headers", "x-seed, x-elapsed-ms, x-reference-text")
                # Chrome's Private Network Access preflight for a public page calling 127.0.0.1
                if self.headers.get("Access-Control-Request-Private-Network") == "true":
                    self.send_header("Access-Control-Allow-Private-Network", "true")

        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self._cors()
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _body(self):
            n = int(self.headers.get("content-length") or 0)
            if n > MAX_BODY:
                raise ValueError("request too large")
            return json.loads(self.rfile.read(n) or b"{}")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            if self.path.rstrip("/") in ("/v1/health", "/health"):
                return self._json(200, {"ok": True, "engine": "voxmel", "model": f"VoxMel-{engine.args.size}",
                                        "device": engine.device, "loaded": engine.model is not None,
                                        "voxmel_commit": VOXMEL_COMMIT})
            self._json(404, {"detail": "not found"})

        def do_POST(self):
            o = self.headers.get("Origin")
            if o and not origin_ok(o):
                return self._json(403, {"detail": f"origin {o} not allowed; start the server with --allow-origin {o}"})
            try:
                req = self._body()
                if self.path == "/v1/transcribe":
                    ref = read_reference(req["reference_wav"], tmpdir)
                    with engine.lock:
                        engine.load()
                        text = engine.transcribe(ref)
                    return self._json(200, {"text": text})
                if self.path == "/v1/audio/speech":
                    text = str(req.get("input") or "").strip()
                    if not text:
                        raise ValueError("input is empty")
                    if len(text) > MAX_TEXT:
                        raise ValueError(f"input is longer than {MAX_TEXT} characters")
                    ref, ref_text = None, None
                    if req.get("reference_wav"):
                        ref = read_reference(req["reference_wav"], tmpdir)
                        ref_text = str(req.get("reference_text") or "").strip()
                        if not ref_text:
                            with engine.lock:
                                engine.load()
                                ref_text = engine.transcribe(ref)
                            if not ref_text:
                                raise ValueError("could not transcribe the reference clip; type what it says")
                    seed = req.get("seed")
                    seed = int(seed) if seed is not None and str(seed) != "" else random.randrange(1 << 31)
                    t = time.time()
                    with engine.lock:
                        audio, sr = engine.speak(text, ref, ref_text, seed, req.get("cfg_text_strength"), req.get("cfg_spk_strength"))
                    ms = int((time.time() - t) * 1000)
                    body = wav_bytes(audio, sr)
                    log(f"spoke {len(audio) / sr:.2f} s in {ms / 1000:.1f} s (seed {seed})")
                    self.send_response(200)
                    self._cors()
                    self.send_header("content-type", "audio/wav")
                    self.send_header("content-length", str(len(body)))
                    self.send_header("x-seed", str(seed))
                    self.send_header("x-elapsed-ms", str(ms))
                    if ref_text is not None:
                        self.send_header("x-reference-text", base64.b64encode(ref_text.encode()).decode())
                    self.end_headers()
                    self.wfile.write(body)
                    return
                self._json(404, {"detail": "not found"})
            except (ValueError, KeyError) as e:
                self._json(400, {"detail": str(e)})
            except Exception as e:      # noqa: BLE001 - report to the page instead of dropping the socket
                log("error:", repr(e))
                self._json(500, {"detail": f"{type(e).__name__}: {e}"})

    return H


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1", help="keep 127.0.0.1 unless you know why (default %(default)s)")
    p.add_argument("--port", type=int, default=1920)
    p.add_argument("--size", choices=sorted(MODELS), default="0.3B", help="VoxMel model (default %(default)s)")
    p.add_argument("--device", default="auto", help="auto | cpu | cuda | mps (default %(default)s)")
    p.add_argument("--threads", type=int, default=0, help="CPU threads for PyTorch (0 = PyTorch default)")
    p.add_argument("--cache", default=os.environ.get("VOXMEL_CACHE", "~/.cache/coproducer-voxmel"))
    p.add_argument("--whisper", default="base.en", help="Whisper model used to transcribe a reference clip (default %(default)s)")
    p.add_argument("--allow-origin", action="append", default=[], help="extra page origin allowed to call this server (repeatable; '*' allows any)")
    p.add_argument("--preload", action="store_true", help="load the model at start instead of on the first request")
    p.add_argument("--model-dir", help=argparse.SUPPRESS)       # use already-downloaded files (testing)
    p.add_argument("--checkpoint", default="model_M_final.pt", help=argparse.SUPPRESS)
    p.add_argument("--vocos-dir", help=argparse.SUPPRESS)
    p.add_argument("--voxmel-src", help=argparse.SUPPRESS)
    a = p.parse_args(argv)
    engine = Engine(a)
    if a.preload:
        engine.load()
    tmpdir = Path(tempfile.mkdtemp(prefix="voxmel-ref-"))
    origins = DEFAULT_ORIGINS + a.allow_origin
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(engine, origins, tmpdir))
    log(f"VoxMel server on http://{a.host}:{a.port}  (allowed pages: {', '.join(origins)})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    main()
