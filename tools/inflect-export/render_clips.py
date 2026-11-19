"""Pre-render the Stem Studio guide lines (js/guide-voice/lines.json) with Inflect Mini v3, on the CPU.

    python render_clips.py --inflect /path/to/Inflect-Mini-v3 --out ../../js/guide-voice/clips

Uses Inflect's own runtime and text front end (`core/synthesize.py`, canonical CPU path, base profile, seed 42),
exactly as `python run.py speech` does, then encodes 48 kb/s mono MP3 with ffmpeg. Writes clips.json
(key -> file, text, seconds, sha256 of the MP3). Inflect Mini v3 code and weights: Apache-2.0 (Owen Song).
"""
import argparse, hashlib, importlib.util, json, re, subprocess, sys, tempfile
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--inflect', required=True, type=Path)
ap.add_argument('--out', required=True, type=Path)
ap.add_argument('--lines', type=Path, default=Path(__file__).resolve().parents[2] / 'js/guide-voice/lines.json')
a = ap.parse_args()
core_dir = (a.inflect / 'core').resolve()
spec = importlib.util.spec_from_file_location('_inflect_sel', core_dir / 'synthesize.py')
S = importlib.util.module_from_spec(spec); sys.modules['_inflect_sel'] = S; spec.loader.exec_module(S)
S.verify(core_dir)
cli, runtime, _ = S.load_selected('mini', 'cpu', 'base', root=core_dir)
numeric = cli.load_numeric(core_dir / 'baseline')
L = json.loads(a.lines.read_text())
items = [(f"tip:{t['id']}", t['text']) for t in L['tips']] + list(L['confirm'].items())
a.out.mkdir(parents=True, exist_ok=True)
manifest = {}
for key, text in items:
    prepared = cli.prepare_text(text, numeric, 'conservative')
    wav, meta = S.render(prepared, L['voice'], runtime, None, 42, 'PCM_16')
    name = re.sub(r'[^a-z0-9]+', '-', key.lower()).strip('-') + '.mp3'
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        tmp.write(wav); tmp.flush()
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp.name, '-ac', '1', '-ar', '24000', '-b:a', '48k', str(a.out / name)], check=True)
    data = (a.out / name).read_bytes()
    seconds = round((len(wav) - 44) / 2 / 24000, 2)
    manifest[key] = {'file': name, 'text': text, 'seconds': seconds, 'sha256': hashlib.sha256(data).hexdigest()}
    print(key, seconds, 's')
(a.out / 'clips.json').write_text(json.dumps({'voice': L['voice'], 'model': 'owensong/Inflect-Mini-v3@0490aee6a9c66f9375b48287a2c5e5788afd00cc',
                                               'clips': manifest}, indent=1))
