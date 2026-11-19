# VoxMel server for Voice Tags (voice cloning on your computer)

The Voice Tags page (`voice-tags.html`, engine **VoxMel voice clone (on this computer)**) talks to this
small server. It runs [VoxMel](https://github.com/VoxDance-Lab/VoxMel) on your own machine and clones a
voice from a short reference clip. The page sends the clip and your text to `127.0.0.1` only; nothing
is uploaded to CoProducer or anyone else.

## Licence: read this first

| Part | Licence | Notes |
|---|---|---|
| VoxMel code (`VoxDance-Lab/VoxMel`) | Apache-2.0 (`LICENSE`; `setup.py` says MIT) | downloaded at commit `1b0bc1cc63155b0197825178e896b63f7c0c554c` |
| VoxMel-0.3B / 0.6B weights | Apache-2.0 (model cards) | downloaded from Hugging Face at pinned revisions |
| **Training data: Emilia** | **CC BY-NC 4.0 (non-commercial)** | VoxMel was trained on 100K hours of Emilia |
| Vocos mel 24 kHz (charactr) | MIT | vocoder |
| Qwen2.5 tokenizer (in the VoxMel repo) | Apache-2.0 | |
| openai-whisper | MIT (code and weights) | only for "Transcribe" |
| this server | Apache-2.0 (CoProducer) | |

The weights are released as Apache-2.0, which allows commercial use, but the data they were trained on
is non-commercial. Whether that restriction reaches the model's output is not settled law. CoProducer
therefore **does not host, bundle or redistribute VoxMel**: you download it yourself with this script and
decide for your own use. Before you release a track commercially with a VoxMel voice, take advice.
Only clone your own voice or a voice whose owner has given you permission.

## Run it

Python 3.10–3.12 (VoxMel does not support 3.13).

```bash
cd tools/voxmel-server
python3.12 -m venv .venv && . .venv/bin/activate        # Windows: py -3.12 -m venv .venv; .venv\Scripts\activate
# PyTorch first. CPU:
pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
#   NVIDIA GPU instead: pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
python server.py                     # http://127.0.0.1:1920, VoxMel-0.3B
```

The first start downloads about 1.3 GB into `~/.cache/coproducer-voxmel` (VoxMel source archive,
VoxMel-0.3B, Vocos), checked against pinned revisions and SHA-256. `--size 0.6B` uses the larger
model (2.8 GB, better quality, slower). Then open Voice Tags, pick **VoxMel voice clone**, choose a
5–15 s clip of one person speaking clearly, type exactly what it says (or press **Transcribe**), tick
the permission box and press **Make tag**.

Options: `--device cpu|cuda|mps`, `--threads N`, `--port`, `--preload` (load at start),
`--whisper small.en` (better transcripts), `--allow-origin http://localhost:8000` (when you serve the
site yourself; `https://myaiplug.github.io`, `http://localhost:*` and `http://127.0.0.1:*` are allowed
by default). The server only listens on 127.0.0.1.

## Measured (CPU only)

On a 4-thread Linux x86-64 CPU, VoxMel-0.3B: model load 4 s, a 2.3–2.7 s line in 4.8–6.8 s
(Whisper ASR of the outputs read back the requested text). **GPU (CUDA / MPS) is untested.**

## API

* `GET /v1/health` → `{"ok": true, "engine": "voxmel", "model": "VoxMel-0.3B", "device": "cpu", "loaded": true}`
* `POST /v1/transcribe` `{"reference_wav": "<base64 WAV>"}` → `{"text": "..."}`
* `POST /v1/audio/speech` `{"input": "text", "reference_wav": "<base64 WAV>", "reference_text": "exact transcript", "seed": 7}`
  → `audio/wav` (24 kHz mono 16-bit), headers `x-seed`, `x-elapsed-ms`, `x-reference-text` (base64, when the server transcribed the clip).
  Leave `reference_text` empty to transcribe with Whisper; omit `reference_wav` for VoxMel's default voice.

Tests (no model needed): `python -m unittest test_server.py`
