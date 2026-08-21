"""Bake multi-track A/B catalog from real engine reports + existing audio pairs."""
from __future__ import annotations

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

ENGINE = Path(r"D:\nodaw\coproducer audio analysis")
JSON = ENGINE / "reports" / "json"
WEB = Path(__file__).resolve().parents[1]
DEMO = WEB / "demo"
ROW_SPECS = (
    ("Score", "score"),
    ("Rating", "rating"),
    ("Integrated LUFS", "lufs"),
    ("True peak dBTP", "tp"),
    ("Dynamic range dB", "dr"),
    ("Clipped samples", "clips"),
    ("Noise floor dBFS", "noise"),
    ("Phase correlation", "phase"),
)

# Existing files only — never invent numbers. Excerpt lengths match the shorter file.
TRACKS = [
    {
        "id": "crazy-stacy",
        "title": "Crazy Stacy",
        "problem": "831 clipped samples and an unsafe true peak on a vocal mix.",
        "before_json": JSON / "Crazy_Stacy_audio_quality.json",
        "after_json": JSON / "Crazy_Stacy_repaired_audio_quality.json",
        "before_audio": [
            Path(r"E:\Music\bTHIRTYthreezy\b33zy\Crazy Stacy.wav"),
            DEMO / "before.m4a",
        ],
        "after_audio": [
            ENGINE / "exports" / "repairs" / "Crazy Stacy_repaired.wav",
            DEMO / "after.m4a",
        ],
        "ss": 12,
        "dur": 45,
        "reuse": ("before.m4a", "after.m4a"),
    },
    {
        "id": "beatgohard",
        "title": "BeatGoHard",
        "problem": "True peak above the −1.0 dBTP streaming ceiling with no sample clips.",
        "before_json": JSON / "33-hard_audio_quality.json",
        "after_json": JSON / "33-hard_repaired_audio_quality.json",
        "before_audio": [Path(r"E:\Music\bTHIRTYthreezy\b33zy\33-hard.mp3")],
        "after_audio": [Path(r"D:\Audio\33-hard_repaired.wav")],
        "ss": 12,
        "dur": 45,
        "reuse": None,
    },
    {
        "id": "drippin",
        "title": "Drippin",
        "problem": "231k clipped samples, −11.9 LUFS, and a +1.06 dBTP overshoot.",
        "before_json": JSON / "bassboost_audio_quality.json",
        "after_json": JSON / "bassboost_repaired_audio_quality.json",
        "before_audio": [Path(r"D:\Audio\_bassboost.wav")],
        "after_audio": [Path(r"C:\Users\Gaming\Music\CoProducer\_bassboost_repaired.wav")],
        "ss": 12,
        "dur": 45,
        "reuse": None,
    },
]


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _fields(report: dict[str, Any]) -> dict[str, Any]:
    m = (report.get("track") or {}).get("metrics") or {}
    loud = m.get("loudness") or {}
    noise = m.get("noise_floor_dbfs")
    if isinstance(noise, (int, float)) and noise < -120:
        noise = None
    return {
        "score": report.get("score"),
        "rating": report.get("rating"),
        "lufs": loud.get("integrated_lufs"),
        "tp": loud.get("true_peak_dbtp"),
        "dr": m.get("dynamic_range_db"),
        "clips": m.get("clipped_samples_estimate"),
        "noise": noise,
        "phase": m.get("phase_correlation"),
    }


def _delta(before: Any, after: Any) -> Any:
    if isinstance(before, str) or isinstance(after, str) or before is None or after is None:
        return ""
    if isinstance(before, int) and isinstance(after, int):
        return after - before
    return round(float(after) - float(before), 2)


def _public_metrics(report: dict[str, Any]) -> dict[str, Any]:
    metrics = deepcopy((report.get("track") or {}).get("metrics") or {})
    metrics.pop("waveform", None)
    noise = metrics.get("noise_floor_dbfs")
    if isinstance(noise, (int, float)) and noise < -120:
        metrics["noise_floor_dbfs"] = None
    return metrics


def _first_existing(paths: list[Path]) -> Path | None:
    for p in paths:
        if p.is_file():
            return p
    return None


def _ffmpeg_excerpt(src: Path, dest: Path, ss: int, dur: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-ss", str(ss), "-t", str(dur), "-i", str(src),
        "-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "256k", str(dest),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def _rows(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    bf, af = _fields(before), _fields(after)
    return [
        {"metric": label, "before": bf[key], "after": af[key], "delta": _delta(bf[key], af[key])}
        for label, key in ROW_SPECS
    ]


def bake() -> int:
    DEMO.mkdir(parents=True, exist_ok=True)
    catalog: list[dict[str, Any]] = []
    for spec in TRACKS:
        bj, aj = spec["before_json"], spec["after_json"]
        if not bj.is_file() or not aj.is_file():
            print(f"skip {spec['id']}: missing JSON", file=sys.stderr)
            continue
        before_r, after_r = _load(bj), _load(aj)
        reuse = spec.get("reuse")
        if reuse:
            before_file, after_file = reuse
            if not (DEMO / before_file).is_file() or not (DEMO / after_file).is_file():
                print(f"skip {spec['id']}: missing reused m4a", file=sys.stderr)
                continue
        else:
            src_b = _first_existing(spec["before_audio"])
            src_a = _first_existing(spec["after_audio"])
            if not src_b or not src_a:
                print(f"skip {spec['id']}: missing audio {src_b} {src_a}", file=sys.stderr)
                continue
            before_file = f"{spec['id']}-before.m4a"
            after_file = f"{spec['id']}-after.m4a"
            print(f"encode {spec['id']} from {src_b.name} / {src_a.name}")
            _ffmpeg_excerpt(src_b, DEMO / before_file, spec["ss"], spec["dur"])
            _ffmpeg_excerpt(src_a, DEMO / after_file, spec["ss"], spec["dur"])
        catalog.append({
            "id": spec["id"],
            "title": spec["title"],
            "problem": spec["problem"],
            "excerptSeconds": spec["dur"],
            "beforeFile": before_file,
            "afterFile": after_file,
            "before": {
                "score": before_r.get("score"),
                "rating": before_r.get("rating"),
                "file": before_file,
                "metrics": _public_metrics(before_r),
            },
            "after": {
                "score": after_r.get("score"),
                "rating": after_r.get("rating"),
                "file": after_file,
                "metrics": _public_metrics(after_r),
            },
            "rows": _rows(before_r, after_r),
        })
        print(
            f"  {spec['title']}: {before_r.get('score')} -> {after_r.get('score')}"
        )
    if not catalog:
        print("no tracks baked", file=sys.stderr)
        return 1
    (DEMO / "tracks.json").write_text(
        json.dumps({"tracks": catalog}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {DEMO / 'tracks.json'} ({len(catalog)} tracks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(bake())
