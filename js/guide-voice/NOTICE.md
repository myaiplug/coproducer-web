# Guide voice: notices

Voice: **Inflect Mini v3** by Owen Song, voice preset "hope", from
https://huggingface.co/owensong/Inflect-Mini-v3 at commit `0490aee6a9c66f9375b48287a2c5e5788afd00cc`.

* License: code and weights Apache-2.0 (`LICENSING.md`, owner attestation; `core/LICENSE_SCOPE.json` lists the covered
  weight files and their hashes). The Apache grant replaced earlier evaluation-only terms.
* Derived from Kokoro-82M (Apache-2.0) and StyleTTS 2 (MIT).
* `clips/` were rendered on a CPU with Inflect's own runtime (`tools/inflect-export/render_clips.py`, seed 42, base
  profile) and encoded to MP3 with ffmpeg. `clips/clips.json` lists the text and SHA-256 of each clip.
* The live engine (`inflect-worker.js`) runs ONNX graphs exported from the same weights (`tools/inflect-export`).
  It is off until `INFLECT_ONNX_BASE` in `models.js` points at a host; files are SHA-256 checked before use.
* Not used: Inflect's espeak-ng fallback (GPL-3.0), its spaCy pipeline, the optional tuner / event extras and the
  NVIDIA OpenMDW components.

Copyright Owen Song. Licensed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0
