"""Bake homepage A/B demo.json + aligned 45 s AAC excerpts from engine reports."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

ENGINE_ROOT = Path(r"D:\nodaw\coproducer audio analysis")
BEFORE_JSON = ENGINE_ROOT / "reports" / "json" / "Crazy_Stacy_audio_quality.json"
AFTER_JSON = ENGINE_ROOT / "reports" / "json" / "Crazy_Stacy_repaired_audio_quality.json"
REPAIRS_DIR = ENGINE_ROOT / "exports" / "repairs"
FALLBACK_MP3 = ENGINE_ROOT / "input" / "song" / "original.mp3"
WEB_ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = WEB_ROOT / "demo"
EXCERPT_SS = "12"
EXCERPT_T = "45"
EXCERPT_SECONDS = 45
ROW_SPECS: tuple[tuple[str, str], ...] = (
    ("Score", "score"),
    ("Rating", "rating"),
    ("Integrated LUFS", "lufs"),
    ("True peak dBTP", "tp"),
    ("Dynamic range dB", "dr"),
    ("Clipped samples", "clips"),
    ("Noise floor dBFS", "noise"),
    ("Phase correlation", "phase"),
)


def _load_report(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _metrics(report: dict[str, Any]) -> dict[str, Any]:
    return dict((report.get("track") or {}).get("metrics") or {})


def _loudness(report: dict[str, Any]) -> dict[str, Any]:
    return dict(_metrics(report).get("loudness") or {})


def _fields(report: dict[str, Any]) -> dict[str, Any]:
    m = _metrics(report)
    loud = _loudness(report)
    return {
        "score": report.get("score"),
        "rating": report.get("rating"),
        "lufs": loud.get("integrated_lufs"),
        "tp": loud.get("true_peak_dbtp"),
        "dr": m.get("dynamic_range_db"),
        "clips": m.get("clipped_samples_estimate"),
        "noise": m.get("noise_floor_dbfs"),
        "phase": m.get("phase_correlation"),
    }


def _delta(before: Any, after: Any) -> Any:
    if isinstance(before, str) or isinstance(after, str):
        return ""
    if before is None or after is None:
        return ""
    if isinstance(before, bool) or isinstance(after, bool):
        return ""
    if isinstance(before, int) and isinstance(after, int):
        return after - before
    return round(float(after) - float(before), 2)


def _public_metrics(report: dict[str, Any]) -> dict[str, Any]:
    metrics = deepcopy(_metrics(report))
    metrics.pop("waveform", None)
    return metrics


def _side(report: dict[str, Any], file_name: str) -> dict[str, Any]:
    return {
        "score": report.get("score"),
        "rating": report.get("rating"),
        "file": file_name,
        "metrics": _public_metrics(report),
    }


def build_demo(before_report: dict[str, Any], after_report: dict[str, Any]) -> dict[str, Any]:
    bf = _fields(before_report)
    af = _fields(after_report)
    rows = []
    for label, key in ROW_SPECS:
        rows.append(
            {
                "metric": label,
                "before": bf[key],
                "after": af[key],
                "delta": _delta(bf[key], af[key]),
            }
        )
    return {
        "title": "Crazy Stacy",
        "excerptSeconds": EXCERPT_SECONDS,
        "before": _side(before_report, "before.m4a"),
        "after": _side(after_report, "after.m4a"),
        "rows": rows,
    }


def _is_file(path: Path | None) -> Path | None:
    if path is not None and path.is_file():
        return path
    return None


def _audio_path(report: dict[str, Any]) -> Path | None:
    raw = ((report.get("track") or {}).get("audio") or {}).get("path")
    if not raw:
        return None
    return Path(str(raw))


def _without_segment(path: Path, segment: str) -> Path:
    parts = [p for p in path.parts if p != segment]
    if not parts or parts == list(path.parts):
        return path
    return Path(*parts)


def resolve_before(report: dict[str, Any]) -> Path | None:
    json_path = _audio_path(report)
    candidates: list[Path] = []
    if json_path is not None:
        candidates.append(json_path)
        dropped = _without_segment(json_path, "1 Laptop")
        if dropped != json_path:
            candidates.append(dropped)
        name = json_path.name
        candidates.append(Path(r"E:\Music\bTHIRTYthreezy\b33zy") / name)
        candidates.append(Path(r"E:\Music\1 Laptop\bTHIRTYthreezy\b33zy") / name)
    for cand in candidates:
        found = _is_file(cand)
        if found is not None:
            return found
    return None


def resolve_after(report: dict[str, Any]) -> Path | None:
    json_path = _audio_path(report)
    found = _is_file(json_path) if json_path is not None else None
    if found is not None:
        return found
    if not REPAIRS_DIR.is_dir():
        return None
    hits = sorted(REPAIRS_DIR.glob("*Crazy*Stacy*repaired*.wav"))
    if not hits:
        hits = sorted(REPAIRS_DIR.glob("*Crazy*Stacy*repaired*.WAV"))
    for hit in hits:
        if hit.is_file():
            return hit
    return None


def _engine_on_path() -> None:
    app = str(ENGINE_ROOT / "app")
    if app not in sys.path:
        sys.path.insert(0, app)


def _engine_runner():
    _engine_on_path()
    from nodaw.core.engine import WorkflowRunner
    from nodaw.utils.logging_utils import configure_logging

    log = configure_logging(ENGINE_ROOT / "logs", verbose=False)
    return WorkflowRunner(ENGINE_ROOT, log, generate_previews=False)


def analyze_existing(src: Path) -> dict[str, Any]:
    """Measure the file we will excerpt. persist=False; never the web API."""
    print(f"analyzing {src} (WorkflowRunner.single persist=False)")
    report = _engine_runner().single(src, persist=False)
    loud = ((report.get("track") or {}).get("metrics") or {}).get("loudness") or {}
    clips = ((report.get("track") or {}).get("metrics") or {}).get("clipped_samples_estimate")
    print(
        f"  score={report.get('score')} clips={clips} "
        f"lufs={loud.get('integrated_lufs')} tp={loud.get('true_peak_dbtp')}"
    )
    return report


def offline_repair(src: Path, report: dict[str, Any] | None) -> Path | None:
    """One local run_auto_repair. Never calls the web API."""
    _engine_on_path()
    try:
        from nodaw.config import ProjectPaths, load_settings
        from nodaw.features.repairs import detect_repair_plan, run_auto_repair
    except Exception as exc:
        print(f"cannot import engine repair ({exc})", file=sys.stderr)
        return None
    REPAIRS_DIR.mkdir(parents=True, exist_ok=True)
    settings = load_settings(ProjectPaths(ENGINE_ROOT))
    source_report = report
    if source_report is None:
        source_report = analyze_existing(src)
    plan = detect_repair_plan(source_report, settings=settings)
    result = run_auto_repair(src, REPAIRS_DIR, plan)
    out = Path(str(result.get("out_path") or ""))
    if result.get("ok") and out.is_file():
        print(f"offline repair via {result.get('engine')}: {out}")
        return out
    print(f"offline repair failed: {result.get('error')}", file=sys.stderr)
    return None


def excerpt(src: Path, dest: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is not on PATH")
    cmd = [
        ffmpeg,
        "-y",
        "-ss",
        EXCERPT_SS,
        "-t",
        EXCERPT_T,
        "-i",
        str(src),
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        str(dest),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if proc.returncode != 0 or not dest.is_file():
        detail = (proc.stderr or proc.stdout or "").strip()[-1200:]
        raise RuntimeError(f"ffmpeg excerpt failed for {src}: {detail}")


def write_demo_json(payload: dict[str, Any]) -> Path:
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    dest = DEMO_DIR / "demo.json"
    dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return dest


def _log_mp3_fallback() -> None:
    print(
        "m4a must be produced from input/song/original.mp3 via one local run_auto_repair "
        "then the same ffmpeg excerpt — still real engine output. "
        f"({FALLBACK_MP3})"
        + (" exists." if FALLBACK_MP3.is_file() else " is missing."),
        file=sys.stderr,
    )


def main() -> int:
    if not BEFORE_JSON.is_file() or not AFTER_JSON.is_file():
        print(
            f"missing Crazy Stacy reports:\n  {BEFORE_JSON}\n  {AFTER_JSON}",
            file=sys.stderr,
        )
        return 1

    stored_before = _load_report(BEFORE_JSON)
    stored_after = _load_report(AFTER_JSON)
    payload = build_demo(stored_before, stored_after)
    demo_path = write_demo_json(payload)
    clips_row = next(r for r in payload["rows"] if r["metric"] == "Clipped samples")
    print(
        f"wrote {demo_path} "
        f"score {payload['before']['score']} -> {payload['after']['score']} "
        f"clips {clips_row['before']} -> {clips_row['after']}"
    )

    before_src = resolve_before(stored_before)
    after_src = resolve_after(stored_after)

    if after_src is None and before_src is not None:
        print(
            "repaired WAV missing; running one local run_auto_repair on Crazy Stacy original"
        )
        after_src = offline_repair(before_src, stored_before)

    if before_src is None or after_src is None:
        print(
            "skip baking m4a: Crazy Stacy source audio not found "
            f"(before={before_src}, after={after_src}). "
            "demo.json was written from reports; do not invent numbers. "
            "Do not substitute original.mp3 analysis under title Crazy Stacy.",
            file=sys.stderr,
        )
        _log_mp3_fallback()
        return 1

    before_m4a = DEMO_DIR / "before.m4a"
    after_m4a = DEMO_DIR / "after.m4a"
    if before_m4a.is_file() and after_m4a.is_file():
        print(f"m4a already present; not re-encoding ({before_m4a.name}, {after_m4a.name})")
        return 0

    try:
        excerpt(before_src, before_m4a)
        excerpt(after_src, after_m4a)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"wrote {before_m4a} ({before_m4a.stat().st_size} bytes) from {before_src}")
    print(f"wrote {after_m4a} ({after_m4a.stat().st_size} bytes) from {after_src}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
