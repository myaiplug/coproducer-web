"""Tests for server.py with a fake engine (no PyTorch or model needed): python3 -m unittest test_server.py"""
import base64
import io
import json
import struct
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
import tempfile

import server


def wav_b64(seconds=2.0, sr=16000):
    n = int(seconds * sr)
    data = struct.pack("<%dh" % n, *([1000, -1000] * (n // 2)))
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", len(data))
    return base64.b64encode(hdr + data).decode()


class FakeEngine:
    def __init__(self):
        self.args = type("A", (), {"size": "0.3B"})()
        self.model, self.device, self.lock, self.calls = None, "cpu", threading.Lock(), []

    def load(self):
        self.model = object()

    def transcribe(self, path):
        self.calls.append(("transcribe", Path(path).exists()))
        return "hello from the clip"

    def speak(self, text, ref, ref_text, seed, cfg_text, cfg_spk):
        self.calls.append(("speak", text, ref is not None, ref_text, seed))
        return [0.0, 0.5, -0.5] * 800, 24000


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = FakeEngine()
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(cls.engine, server.DEFAULT_ORIGINS, Path(tempfile.mkdtemp())))
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def req(self, path, body=None, origin="https://myaiplug.github.io", method=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method or ("POST" if data else "GET"),
                                   headers={"content-type": "application/json", **({"Origin": origin} if origin else {})})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def test_health_and_cors(self):
        code, h, body = self.req("/v1/health")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["engine"], "voxmel")
        self.assertEqual(h.get("Access-Control-Allow-Origin"), "https://myaiplug.github.io")
        code, h, _ = self.req("/v1/health", origin="http://localhost:8124")
        self.assertEqual(h.get("Access-Control-Allow-Origin"), "http://localhost:8124")
        code, h, _ = self.req("/v1/health", origin="https://evil.example")
        self.assertNotIn("Access-Control-Allow-Origin", h)

    def test_foreign_origin_cannot_generate(self):
        code, _, body = self.req("/v1/audio/speech", {"input": "hi"}, origin="https://evil.example")
        self.assertEqual(code, 403)

    def test_speech_with_reference_and_auto_transcript(self):
        code, h, body = self.req("/v1/audio/speech", {"input": "Produced by Beez.", "reference_wav": wav_b64(), "seed": 5})
        self.assertEqual(code, 200, body)
        self.assertEqual(h.get("content-type"), "audio/wav")
        self.assertEqual(body[:4], b"RIFF")
        self.assertEqual(h.get("x-seed"), "5")
        self.assertEqual(base64.b64decode(h["x-reference-text"]).decode(), "hello from the clip")
        self.assertIn(("speak", "Produced by Beez.", True, "hello from the clip", 5), self.engine.calls)

    def test_validation(self):
        self.assertEqual(self.req("/v1/audio/speech", {"input": ""})[0], 400)
        self.assertEqual(self.req("/v1/audio/speech", {"input": "x" * 401})[0], 400)
        code, _, body = self.req("/v1/audio/speech", {"input": "hi", "reference_wav": wav_b64(0.5), "reference_text": "hi"})
        self.assertEqual(code, 400)
        self.assertIn("at least 1 second", json.loads(body)["detail"])

    def test_transcribe(self):
        code, _, body = self.req("/v1/transcribe", {"reference_wav": wav_b64()})
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["text"], "hello from the clip")

    def test_preflight_private_network(self):
        r = urllib.request.Request(self.base + "/v1/audio/speech", method="OPTIONS", headers={
            "Origin": "https://myaiplug.github.io", "Access-Control-Request-Private-Network": "true"})
        with urllib.request.urlopen(r) as resp:
            self.assertEqual(resp.status, 204)
            self.assertEqual(resp.headers.get("Access-Control-Allow-Private-Network"), "true")

    def test_pins(self):
        self.assertEqual(len(server.VOXMEL_COMMIT), 40)
        for m in server.MODELS.values():
            self.assertEqual(len(m["revision"]), 40)
        self.assertEqual(len(server.VOCOS["revision"]), 40)


if __name__ == "__main__":
    unittest.main()
