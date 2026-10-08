# Web Analyze Report + Homepage A/B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split-page CoProducer site: homepage plays a real engine before/after A/B; `analyze.html` measures an upload with the desktop engine and shows projected post-repair stats (no server-side repair) plus $49 one-time Pro pricing.

**Architecture:** Static pages in `D:\Projects\coproducer\nodaw-web` (GitHub Pages). Python API in the engine repo wraps `WorkflowRunner.analyze` + `detect_repair_plan` + a projection helper. Demo audio/JSON are pre-baked static files. Analyze never calls `run_auto_repair`.

**Tech Stack:** Python 3.11, existing `nodaw` package, stdlib `http.server`, static HTML/CSS/JS (`type=module`), Web Audio API, pytest.

## Global Constraints

- Engine root: `D:\nodaw\coproducer audio analysis`. Web root: `D:\Projects\coproducer\nodaw-web`.
- Web git repo is `D:\Projects\coproducer` (commit nodaw-web files there). Engine API files commit in the engine root if that repo is usable; otherwise copy the same files into `D:\Projects\coproducer` under `web/` + `app/nodaw/features/web_projection.py`.
- Visual system for A/B + analyze: `#020617` bg, `rgba(15,23,42,0.92)` surface, cyan `#22d3ee`, emerald `#10b981`, orange `#f97316`, red `#ef4444`, gold `#facc15`, Rajdhani / Manrope / JetBrains Mono — match `guides/what-is-lufs.html` and `comparisons/vs-landr.html`.
- Price: CoProducer Pro `$49` one-time (no discount code).
- API default `http://127.0.0.1:8788`, override `?api=`.
- Analyze does **not** repair, render, or return audio. Player on analyze decodes the local `File`.
- Upload cap 40 MB. Extensions: `.wav .mp3 .flac .m4a .aac .ogg .opus .aiff .aif`.
- No emoji in product chrome. No invented demo numbers.
- Python 3.11 only (`py -3.11`).
- Download CTA stays `https://github.com/myaiplug/coproducer/releases/download/v1.0.0-beta/CoProducer-Setup-1.0.0-beta.exe`.

## File map

| File | Responsibility |
| `app/nodaw/features/web_projection.py` | Project metrics from `RepairPlan`; `vs_target` rows; strip paths; public JSON shape |
| `web/server.py` | CORS HTTP API: `/health`, `POST /api/analyze`; no repair |
| `tests/test_web_projection.py` | Projection + vs_target + path strip |
| `tests/test_web_server.py` | Health, size reject, busy, mocked analyze payload |
| `nodaw-web/css/report.css` | Shared report/player/table styles |
| `nodaw-web/js/player-math.js` | Pure gain/seek/color helpers (node-testable) |
| `nodaw-web/js/player.js` | Web Audio A/B + single-file player |
| `nodaw-web/js/report.js` | API client, table render, promo copy |
| `nodaw-web/analyze.html` | Upload + report page |
| `nodaw-web/index.html` | Replace browser-toy `#analyze` with A/B section `#ab` |
| `nodaw-web/demo/demo.json` | Real Crazy Stacy (or fallback) before/after metrics |
| `nodaw-web/demo/before.m4a` `after.m4a` | 45 s aligned excerpts |
| `nodaw-web/tools/bake_demo.py` | Build demo JSON + m4a from engine reports/audio |
| `nodaw-web/sitemap.xml` | Add `analyze.html` |

---

### Task 1: Projection helper (no audio render)

**Files:**
- Create: `D:\nodaw\coproducer audio analysis\app\nodaw\features\web_projection.py`
- Create: `D:\nodaw\coproducer audio analysis\tests\test_web_projection.py`
- Modify: `D:\nodaw\coproducer audio analysis\app\nodaw\core\engine.py` — add `persist: bool = True` to `single()` (only skip `write_report` when False; do not change scoring)

**Interfaces:**
- Consumes: `detect_repair_plan(source, settings=settings)`, `evaluate_track(track, settings)`, `rating(score)`, `floor_score_after_repair(pre, post, findings=..., applied_filters=...)`, `RepairPlan`, `TrackAnalysis`
- Produces:
  - `PROMO = None  # retired; Pro is $49 one-time`
  - `track_from_report(report: dict) -> TrackAnalysis`
  - `project_from_report(report: dict, settings: dict) -> dict` with keys `score`, `rating`, `metrics`, `needed`, `plan` (`needed`, `summary`, `actions` as `{id,label,reason,confidence,severity}`, `cautions`)
  - `vs_target_rows(yours_metrics: dict, projected_metrics: dict, yours_score: int, projected_score: int, audio: dict, settings: dict) -> list[dict]`
  - `public_analyze_payload(report: dict, settings: dict) -> dict` (strips `track.audio.path`)
  - `WorkflowRunner.single(..., persist: bool = True)`

- [ ] **Step 1: Write the failing tests**

Create `tests/__init__.py` (empty) if missing. Create `tests/test_web_projection.py`:

```python
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

from nodaw.features.web_projection import (  # noqa: E402
    PROMO,
    public_analyze_payload,
    project_from_report,
    vs_target_rows,
)

SETTINGS = {
    "analysis": {
        "target_lufs": -14.0,
        "true_peak_ceiling_dbtp": -1.0,
        "minimum_sample_rate_hz": 44100,
    }
}


def hot_report() -> dict:
    return {
        "score": 70,
        "rating": "Usable after technical corrections",
        "summary": "hot",
        "findings": [{"severity": "warning", "title": "Unsafe true peak", "message": "x", "action": "y", "score_penalty": 14}],
        "streaming_analysis": {"platforms": []},
        "track": {
            "audio": {
                "file_name": "hot.wav",
                "path": "D:\\secret\\hot.wav",
                "size_bytes": 1000,
                "duration_seconds": 10.0,
                "format_name": "wav",
                "codec_name": "pcm_s16le",
                "codec_long_name": "PCM",
                "sample_rate_hz": 44100,
                "channels": 2,
                "channel_layout": "stereo",
                "bit_rate_bps": 1411200,
                "bit_depth": 16,
            },
            "metrics": {
                "loudness": {
                    "integrated_lufs": -8.0,
                    "loudness_range_lu": 5.0,
                    "true_peak_dbtp": 0.4,
                    "threshold_lufs": None,
                    "sample_peak_dbfs": -0.1,
                },
                "peak_dbfs": -0.1,
                "rms_dbfs": -7.0,
                "dynamic_range_db": 8.0,
                "crest_factor": 3.0,
                "clipped_samples_estimate": 40,
                "noise_floor_dbfs": -55.0,
                "stereo_width_percent": 70.0,
                "phase_correlation": 0.85,
                "spectral_balance_db": {"sub_bass": -6.0, "bass": 0.0},
                "waveform": [0.2, 0.9],
            },
            "extra": {},
        },
    }


def clean_report() -> dict:
    r = hot_report()
    r["score"] = 97
    m = r["track"]["metrics"]
    m["loudness"]["integrated_lufs"] = -14.0
    m["loudness"]["true_peak_dbtp"] = -1.2
    m["loudness"]["sample_peak_dbfs"] = -1.2
    m["peak_dbfs"] = -1.2
    m["rms_dbfs"] = -12.0
    m["clipped_samples_estimate"] = 0
    return r


class ProjectionTests(unittest.TestCase):
    def test_loudnorm_projects_lufs_and_true_peak(self) -> None:
        out = project_from_report(hot_report(), SETTINGS)
        self.assertTrue(out["needed"])
        self.assertEqual(out["metrics"]["loudness"]["integrated_lufs"], -14.0)
        self.assertEqual(out["metrics"]["loudness"]["true_peak_dbtp"], -1.0)
        self.assertEqual(out["metrics"]["clipped_samples_estimate"], 0)
        ids = {a["id"] for a in out["plan"]["actions"]}
        self.assertIn("loudnorm", ids)
        self.assertGreaterEqual(out["score"], 70)

    def test_empty_plan_copies_measured(self) -> None:
        out = project_from_report(clean_report(), SETTINGS)
        self.assertFalse(out["needed"])
        self.assertEqual(out["metrics"]["loudness"]["integrated_lufs"], -14.0)
        self.assertEqual(out["score"], 97)

    def test_phase_unchanged(self) -> None:
        r = hot_report()
        r["track"]["metrics"]["phase_correlation"] = -0.2
        out = project_from_report(r, SETTINGS)
        self.assertEqual(out["metrics"]["phase_correlation"], -0.2)
        self.assertTrue(any("phase" in c.lower() for c in out["plan"]["cautions"]))

    def test_vs_target_and_path_strip(self) -> None:
        payload = public_analyze_payload(hot_report(), SETTINGS)
        self.assertIsNone(payload["track"]["audio"].get("path"))
        self.assertEqual(payload["promo"], PROMO)
        lufs = next(row for row in payload["vs_target"] if row["metric"] == "Integrated LUFS")
        self.assertEqual(lufs["target"], -14.0)
        self.assertEqual(lufs["projected"], -14.0)
        self.assertEqual(lufs["status_projected"], "pass")
        self.assertEqual(lufs["status_yours"], "off")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.11 -m unittest tests.test_web_projection -v` from `D:\nodaw\coproducer audio analysis`

Expected: FAIL with `ModuleNotFoundError: nodaw.features.web_projection`

- [ ] **Step 3: Implement `web_projection.py` and `persist` flag**

`app/nodaw/features/web_projection.py`:

```python
from __future__ import annotations

import copy
from typing import Any

from ..core.models import AudioInfo, AudioMetrics, LoudnessMetrics, TrackAnalysis
from ..core.scoring import evaluate_track, floor_score_after_repair, rating
from .repairs import detect_repair_plan

PROMO = None  # retired; Pro is $49 one-time

LUFS_PASS_LU = 1.5
TP_EPSILON_DB = 0.15


def track_from_report(report: dict[str, Any]) -> TrackAnalysis:
    t = report["track"]
    a = t["audio"]
    m = t["metrics"]
    lm = m.get("loudness") or {}
    return TrackAnalysis(
        audio=AudioInfo(
            file_name=str(a.get("file_name") or "upload"),
            path=str(a.get("path") or ""),
            size_bytes=int(a.get("size_bytes") or 0),
            duration_seconds=float(a.get("duration_seconds") or 0.0),
            format_name=str(a.get("format_name") or "unknown"),
            codec_name=str(a.get("codec_name") or "unknown"),
            codec_long_name=str(a.get("codec_long_name") or "unknown"),
            sample_rate_hz=int(a.get("sample_rate_hz") or 0),
            channels=int(a.get("channels") or 0),
            channel_layout=str(a.get("channel_layout") or "unknown"),
            bit_rate_bps=a.get("bit_rate_bps"),
            bit_depth=a.get("bit_depth"),
        ),
        metrics=AudioMetrics(
            loudness=LoudnessMetrics(
                integrated_lufs=lm.get("integrated_lufs"),
                loudness_range_lu=lm.get("loudness_range_lu"),
                true_peak_dbtp=lm.get("true_peak_dbtp"),
                threshold_lufs=lm.get("threshold_lufs"),
                sample_peak_dbfs=lm.get("sample_peak_dbfs"),
            ),
            peak_dbfs=m.get("peak_dbfs"),
            rms_dbfs=m.get("rms_dbfs"),
            dynamic_range_db=m.get("dynamic_range_db"),
            crest_factor=m.get("crest_factor"),
            clipped_samples_estimate=int(m.get("clipped_samples_estimate") or 0),
            noise_floor_dbfs=m.get("noise_floor_dbfs"),
            stereo_width_percent=m.get("stereo_width_percent"),
            phase_correlation=m.get("phase_correlation"),
            spectral_balance_db=dict(m.get("spectral_balance_db") or {}),
            waveform=list(m.get("waveform") or []),
        ),
        extra=dict(t.get("extra") or {}),
    )


def _apply_plan_to_metrics(metrics: dict[str, Any], plan, extra: dict[str, Any]) -> dict[str, Any]:
    m = copy.deepcopy(metrics)
    lm = m.setdefault("loudness", {})
    ids = {a.id for a in plan.actions}
    target, ceiling = float(plan.target_lufs), float(plan.tp_ceiling)
    if "loudnorm" in ids:
        cur = lm.get("integrated_lufs")
        if cur is not None and m.get("rms_dbfs") is not None:
            m["rms_dbfs"] = round(float(m["rms_dbfs"]) + (target - float(cur)), 2)
        lm["integrated_lufs"] = target
        lm["true_peak_dbtp"] = ceiling
        lm["sample_peak_dbfs"] = ceiling
        m["peak_dbfs"] = ceiling
        m["clipped_samples_estimate"] = 0
    elif "true_peak_limit" in ids:
        lm["true_peak_dbtp"] = ceiling
        lm["sample_peak_dbfs"] = ceiling
        m["peak_dbfs"] = ceiling
        m["clipped_samples_estimate"] = 0
    if "highpass" in ids:
        faults = extra.setdefault("technical_faults", {})
        if isinstance(faults, dict):
            faults["dc_offset"] = 0.0
        noise = m.get("noise_floor_dbfs")
        if noise is not None and -70.0 <= float(noise) <= -42.0:
            m["noise_floor_dbfs"] = round(float(noise) - 3.0, 2)
    return m


def project_from_report(report: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    plan = detect_repair_plan(report, settings=settings)
    track = track_from_report(report)
    pre = int(report.get("score") or 0)
    metrics = copy.deepcopy(track.to_dict()["metrics"])
    extra = copy.deepcopy(track.extra)
    if plan.actions:
        metrics = _apply_plan_to_metrics(metrics, plan, extra)
        projected_track = track_from_report({"track": {"audio": track.to_dict()["audio"], "metrics": metrics, "extra": extra}})
        raw, _rt, _sm, findings = evaluate_track(projected_track, settings)
        score, _f = floor_score_after_repair(
            pre, raw, findings=findings,
            applied_filters=plan.filter_chain,
        )
    else:
        score = pre
        metrics = track.to_dict()["metrics"]
    return {
        "needed": bool(plan.actions),
        "score": int(score),
        "rating": rating(int(score)),
        "metrics": metrics,
        "plan": {
            "needed": bool(plan.actions),
            "summary": plan.summary if plan.actions else "No automatic repair needed",
            "actions": [
                {"id": a.id, "label": a.label, "reason": a.reason, "confidence": a.confidence, "severity": a.severity}
                for a in plan.actions
            ],
            "cautions": list(plan.cautions),
        },
    }


def _status(kind: str, yours, target) -> str:
    if yours is None or target is None:
        return "unknown"
    if kind == "lufs":
        return "pass" if abs(float(yours) - float(target)) <= LUFS_PASS_LU else "off"
    if kind == "tp":
        return "pass" if float(yours) <= float(target) + TP_EPSILON_DB else "off"
    if kind == "clips":
        return "pass" if int(yours) == 0 else "off"
    if kind == "sr":
        return "pass" if int(yours) >= int(target) else "off"
    if kind == "phase":
        return "pass" if float(yours) >= float(target) else "off"
    if kind == "score":
        return "pass" if int(yours) >= int(target) else "off"
    return "off"


def vs_target_rows(
    yours_metrics: dict[str, Any],
    projected_metrics: dict[str, Any],
    yours_score: int,
    projected_score: int,
    audio: dict[str, Any],
    settings: dict[str, Any],
) -> list[dict[str, Any]]:
    target_lufs = float(settings["analysis"]["target_lufs"])
    ceiling = float(settings["analysis"]["true_peak_ceiling_dbtp"])
    min_sr = int(settings["analysis"]["minimum_sample_rate_hz"])
    y_lufs = (yours_metrics.get("loudness") or {}).get("integrated_lufs")
    p_lufs = (projected_metrics.get("loudness") or {}).get("integrated_lufs")
    y_tp = (yours_metrics.get("loudness") or {}).get("true_peak_dbtp")
    p_tp = (projected_metrics.get("loudness") or {}).get("true_peak_dbtp")
    rows = [
        ("Integrated LUFS", y_lufs, p_lufs, target_lufs, "lufs"),
        ("True peak dBTP", y_tp, p_tp, ceiling, "tp"),
        ("Clipped samples", yours_metrics.get("clipped_samples_estimate") or 0,
         projected_metrics.get("clipped_samples_estimate") or 0, 0, "clips"),
        ("Sample rate Hz", audio.get("sample_rate_hz"), audio.get("sample_rate_hz"), min_sr, "sr"),
        ("Phase correlation", yours_metrics.get("phase_correlation"),
         projected_metrics.get("phase_correlation"), 0.2, "phase"),
        ("Score", yours_score, projected_score, 90, "score"),
    ]
    out = []
    for name, y, p, tgt, kind in rows:
        dy = None if y is None or tgt is None else round(float(y) - float(tgt), 2)
        dp = None if p is None or tgt is None else round(float(p) - float(tgt), 2)
        out.append({
            "metric": name,
            "yours": y,
            "projected": p,
            "target": tgt,
            "distance_yours": dy,
            "distance_projected": dp,
            "status_yours": _status(kind, y, tgt),
            "status_projected": _status(kind, p, tgt),
        })
    return out


def public_analyze_payload(report: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    projected = project_from_report(report, settings)
    track = copy.deepcopy(report.get("track") or {})
    audio = dict(track.get("audio") or {})
    audio.pop("path", None)
    track["audio"] = audio
    metrics = track.get("metrics") or {}
    streaming = report.get("streaming_analysis") or report.get("streaming") or {}
    platforms = streaming.get("platforms") if isinstance(streaming, dict) else streaming
    return {
        "score": int(report.get("score") or 0),
        "rating": report.get("rating"),
        "summary": report.get("summary"),
        "track": track,
        "findings": report.get("findings") or [],
        "streaming": platforms or [],
        "plan": projected["plan"],
        "projected": {
            "score": projected["score"],
            "rating": projected["rating"],
            "metrics": projected["metrics"],
        },
        "vs_target": vs_target_rows(
            metrics, projected["metrics"],
            int(report.get("score") or 0), projected["score"],
            audio, settings,
        ),
        "promo": dict(PROMO),
    }
```

In `engine.py` `single()`, add `persist: bool = True` and wrap `self.write_report(...)` with `if persist:`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3.11 -m unittest tests.test_web_projection -v`

Expected: four tests PASS. If `test_empty_plan_copies_measured` fails because a clean −14 LUFS / −1.2 dBTP track is not score 97, assert `out["score"] == clean_report()["score"]` and `not out["needed"]` instead — do not loosen the loudnorm test.

- [ ] **Step 5: Commit**

```bash
git add app/nodaw/features/web_projection.py app/nodaw/core/engine.py tests/test_web_projection.py tests/__init__.py
git commit -m "feat: project CoProducer repair stats without rendering"
```

---

### Task 2: Analyze HTTP API (no repair)

**Files:**
- Create: `D:\nodaw\coproducer audio analysis\web\server.py`
- Create: `D:\nodaw\coproducer audio analysis\tests\test_web_server.py`

**Interfaces:**
- Consumes: `WorkflowRunner(root, log, generate_previews=False).single(path, persist=False)`, `public_analyze_payload(report, settings)`
- Produces: process on `127.0.0.1:8788`; `GET /health` → `{ok, engine, ffmpeg}`; `POST /api/analyze` multipart `file` → public payload or error JSON; `OPTIONS` CORS `*`; busy → 503 + `Retry-After: 2`; oversize → 413; bad ext → 415. Deletes temp file in `finally`. Never calls `run_auto_repair`.

- [ ] **Step 1: Write the failing tests**

```python
from __future__ import annotations

import io
import json
import sys
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT))

from tests.test_web_projection import SETTINGS, hot_report  # noqa: E402


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from web import server as web_server
        cls.ws = web_server
        cls.httpd = web_server.ThreadingHTTPServer(("127.0.0.1", 0), web_server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def _conn(self):
        return HTTPConnection("127.0.0.1", self.port, timeout=5)

    def test_health(self):
        c = self._conn(); c.request("GET", "/health")
        r = c.getresponse(); body = json.loads(r.read())
        self.assertEqual(r.status, 200)
        self.assertTrue(body["ok"])

    def test_rejects_oversize(self):
        bound = "----x"
        payload = (
            f"--{bound}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\n"
            f"Content-Type: audio/wav\r\n\r\n" + ("a" * 16) + f"\r\n--{bound}--\r\n"
        ).encode()
        with patch.object(self.ws, "MAX_BYTES", 8):
            c = self._conn()
            c.request("POST", "/api/analyze", body=payload, headers={"Content-Type": f"multipart/form-data; boundary={bound}"})
            r = c.getresponse()
            self.assertEqual(r.status, 413)

    def test_analyze_mocked(self):
        bound = "----x"
        payload = (
            f"--{bound}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"hot.wav\"\r\n"
            f"Content-Type: audio/wav\r\n\r\nRIFFDATA\r\n--{bound}--\r\n"
        ).encode()
        fake = hot_report()
        with patch.object(self.ws.runner, "single", return_value=fake), \
             patch.object(self.ws.runner, "settings", SETTINGS):
            c = self._conn()
            c.request("POST", "/api/analyze", body=payload, headers={"Content-Type": f"multipart/form-data; boundary={bound}"})
            r = c.getresponse(); body = json.loads(r.read())
        self.assertEqual(r.status, 200)
        self.assertNotIn("path", body["track"]["audio"])
        self.assertIsNone(body.get("promo"))
        self.assertIn("vs_target", body)
        self.assertTrue(body["plan"]["needed"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.11 -m unittest tests.test_web_server -v`

Expected: FAIL importing `web.server`

- [ ] **Step 3: Implement `web/server.py`**

Follow the mobile companion parser, with these exact rules:

- `HOST = os.environ.get("COPRODUCER_WEB_HOST", "127.0.0.1")`
- `PORT = int(os.environ.get("COPRODUCER_WEB_PORT", "8788"))`
- `MAX_BYTES = 40 * 1024 * 1024`
- `EXTS = {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".aiff", ".aif"}`
- `threading.Lock()` `_busy`
- CORS on every response: `Access-Control-Allow-Origin: *`, allow headers `Content-Type`, methods `GET, POST, OPTIONS`
- `GET /health`: `{ "ok": true, "engine": "CoProducer Core Analyzer", "ffmpeg": bool }` using `FFmpeg().available()` if that exists, else `shutil.which("ffmpeg")`
- `POST /api/analyze`: if `_busy.locked()` and we cannot acquire immediately → 503 `{"error":"Engine is analyzing another file"}` + `Retry-After: 2`. Else parse multipart `file`, reject missing file 400, bad ext 415, `len(file_bytes) > MAX_BYTES` 413. Write to `tempfile.mkdtemp()` / safe name, `runner.single(dest, persist=False)`, `public_analyze_payload(report, runner.settings)`, `finally: dest.unlink(missing_ok=True); rmtree tmp; _busy.release()`.
- Do not import or call `run_auto_repair`.
- `if __name__ == "__main__":` print bind URL and `serve_forever`.

If `FFmpeg` has no `available()`, use:

```python
def _ffmpeg_ok() -> bool:
    try:
        from nodaw.audio.ffmpeg import FFmpeg
        FFmpeg().require()
        return True
    except Exception:
        return shutil.which("ffmpeg") is not None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3.11 -m unittest tests.test_web_server tests.test_web_projection -v`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/server.py tests/test_web_server.py
git commit -m "feat: add public analyze API without repair"
```

---

### Task 3: Player math (click-free A/B + color map)

**Files:**
- Create: `D:\Projects\coproducer\nodaw-web\js\player-math.js`
- Create: `D:\Projects\coproducer\nodaw-web\js\player-math.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces (ESM):
  - `equalPowerGains(t: number): {a: number, b: number}` — `t` 0=A 1=B, `a=cos(t*π/2)`, `b=sin(t*π/2)`
  - `clamp01(x: number): number`
  - `formatTime(seconds: number): string` — `m:ss` (e.g. `1:05`)
  - `offsetFromClick(x: number, width: number, duration: number): number`
  - `lookaheadWindow(playhead: number, duration: number, ahead=3): {start: number, end: number}`
  - `colorForCentroidHz(hz: number): string` — `<400` `#22d3ee`, `<4000` `#10b981`, else `#facc15`; clip override handled in player not here

- [ ] **Step 1: Write the failing test**

`js/player-math.test.mjs`:

```javascript
import { strict as assert } from 'node:assert';
import { equalPowerGains, clamp01, formatTime, offsetFromClick, lookaheadWindow, colorForCentroidHz } from './player-math.js';

const g0 = equalPowerGains(0);
assert.equal(g0.a, 1);
assert.ok(Math.abs(g0.b) < 1e-10);
const g1 = equalPowerGains(1);
assert.ok(Math.abs(g1.a) < 1e-10);
assert.equal(g1.b, 1);
const mid = equalPowerGains(0.5);
assert.ok(Math.abs(mid.a - Math.SQRT1_2) < 1e-10);
assert.ok(Math.abs(mid.b - Math.SQRT1_2) < 1e-10);
assert.equal(formatTime(65), '1:05');
assert.equal(formatTime(0), '0:00');
assert.equal(offsetFromClick(50, 100, 10), 5);
assert.equal(offsetFromClick(-10, 100, 10), 0);
const w = lookaheadWindow(8, 10, 3);
assert.equal(w.start, 8);
assert.equal(w.end, 10);
assert.equal(colorForCentroidHz(100), '#22d3ee');
assert.equal(colorForCentroidHz(1000), '#10b981');
assert.equal(colorForCentroidHz(8000), '#facc15');
assert.equal(clamp01(1.2), 1);
console.log('player-math ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node "D:\Projects\coproducer\nodaw-web\js\player-math.test.mjs"`

Expected: `ERR_MODULE_NOT_FOUND` for `./player-math.js`

- [ ] **Step 3: Implement `player-math.js`**

```javascript
export function clamp01(x) { return Math.min(1, Math.max(0, x)); }
export function equalPowerGains(t) {
  const x = clamp01(t);
  return { a: Math.cos(x * Math.PI / 2), b: Math.sin(x * Math.PI / 2) };
}
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function offsetFromClick(x, width, duration) {
  if (!width || !duration) return 0;
  return clamp01(x / width) * duration;
}
export function lookaheadWindow(playhead, duration, ahead = 3) {
  const start = Math.max(0, Math.min(playhead, duration));
  return { start, end: Math.min(duration, start + ahead) };
}
export function colorForCentroidHz(hz) {
  if (hz < 400) return '#22d3ee';
  if (hz < 4000) return '#10b981';
  return '#facc15';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node "D:\Projects\coproducer\nodaw-web\js\player-math.test.mjs"`

Expected: `player-math ok`

- [ ] **Step 5: Commit (web repo)**

```bash
git -C "D:\Projects\coproducer" add nodaw-web/js/player-math.js nodaw-web/js/player-math.test.mjs
git -C "D:\Projects\coproducer" commit -m "feat: add A/B player math helpers"
```

---

### Task 4: Waveform player + shared CSS

**Files:**
- Create: `D:\Projects\coproducer\nodaw-web\js\player.js`
- Create: `D:\Projects\coproducer\nodaw-web\css\report.css`

**Interfaces:**
- Consumes: `equalPowerGains`, `formatTime`, `offsetFromClick`, `lookaheadWindow`, `colorForCentroidHz` from `./player-math.js`
- Produces: `export class CoproducerPlayer` with
  - `constructor(root: HTMLElement, { mode: 'ab' | 'single' })`
  - `async load({ a: AudioBuffer|string, b?: AudioBuffer|string, peaksA?: number[], peaksB?: number[] })` — string = URL
  - `play()`, `pause()`, `seek(seconds)`, `setSide('a'|'b')` (ab mode only)
  - `getSide()`, `getTime()`
  - Markup expected inside `root`:
    ```html
    <div class="cp-player" data-mode="ab">
      <canvas class="cp-wave" width="1200" height="220"></canvas>
      <div class="cp-transport">
        <button type="button" class="cp-play">Play</button>
        <span class="cp-time">0:00</span>
        <div class="cp-ab" hidden><button type="button" data-side="a">A</button><button type="button" data-side="b">B</button></div>
      </div>
    </div>
    ```

Player rules (must follow exactly):

- One `AudioContext`. For `ab`, two `GainNode`s into destination. On play, create **two** `BufferSource`s, `start(0, offset)` both, store `startedAt = ctx.currentTime - offset`.
- A/B toggle: 8 ms equal-power ramp using `gain.gain.setValueAtTime` + `linearRampToValueAtTime` with `equalPowerGains` at 0 and 1. Do **not** stop sources on toggle.
- Pause: `source.stop()`, remember offset from `ctx.currentTime - startedAt`.
- Seek: stop, set offset, 5 ms fade-in from 0 to current equal-power gains if playing.
- Click/drag on canvas → `offsetFromClick(event.offsetX, canvas.clientWidth, duration)` then `seek`.
- Draw: stereo-mid envelope; fill color `colorForCentroidHz` using a coarse high-freq energy ratio if peaks not spectral (use amplitude: `|v|>0.99` red `#ef4444`, else map |v| 0–1 from cyan to emerald). Paint lookahead window at 35% white overlay from playhead to +3 s. Shared color scale for A and B (same mapping function).
- `requestAnimationFrame` while playing to move playhead.

`css/report.css` tokens and classes:

```css
:root {
  --cp-bg: #020617;
  --cp-surface: rgba(15, 23, 42, 0.92);
  --cp-border: rgba(51, 65, 85, 0.5);
  --cp-cyan: #22d3ee;
  --cp-emerald: #10b981;
  --cp-orange: #f97316;
  --cp-red: #ef4444;
  --cp-gold: #facc15;
  --cp-text: #e2e8f0;
  --cp-muted: #64748b;
  --cp-mono: 'JetBrains Mono', monospace;
  --cp-tech: 'Rajdhani', sans-serif;
  --cp-body: 'Manrope', sans-serif;
}
.cp-table { width: 100%; border-collapse: collapse; font-family: var(--cp-mono); font-size: 12px; }
.cp-table th, .cp-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--cp-border); }
.cp-table th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--cp-muted); }
.cp-table .pass { color: var(--cp-emerald); }
.cp-table .off { color: var(--cp-red); }
.cp-table .live { background: rgba(34, 211, 238, 0.05); }
.cp-card { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; padding: 24px; }
.cp-promo { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.cp-promo code { font-family: var(--cp-mono); color: var(--cp-gold); font-size: 18px; }
.cp-cta { display: inline-block; padding: 12px 24px; border-radius: 8px; background: #164e63; border: 1px solid #06b6d4; color: #ecfeff; font-family: var(--cp-mono); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-decoration: none; }
.cp-player canvas { width: 100%; height: 220px; background: #070b11; border: 1px solid var(--cp-border); border-radius: 8px; cursor: pointer; }
.table-scroll { overflow: auto; }
```

- [ ] **Step 1: Write `player.js` and `report.css` as specified above**

No extra framework. Keep `player.js` under ~250 lines if possible; do not add a second audio library.

- [ ] **Step 2: Smoke-import**

Run: `node --input-type=module -e "import('./js/player.js').then(()=>console.log('import ok')).catch(e=>{console.error(e); process.exit(1)})"` from `nodaw-web`

Expected: `import ok` (Web Audio classes only touch `window` inside methods, not at module load). Guard `window` so Node import does not throw.

- [ ] **Step 3: Commit**

```bash
git -C "D:\Projects\coproducer" add nodaw-web/js/player.js nodaw-web/css/report.css
git -C "D:\Projects\coproducer" commit -m "feat: add CoProducer waveform player and report CSS"
```

---

### Task 5: Bake demo JSON + aligned 45 s audio

**Files:**
- Create: `D:\Projects\coproducer\nodaw-web\tools\bake_demo.py`
- Create: `D:\Projects\coproducer\nodaw-web\demo\demo.json`
- Create: `D:\Projects\coproducer\nodaw-web\demo\before.m4a`
- Create: `D:\Projects\coproducer\nodaw-web\demo\after.m4a`

**Interfaces:**
- Consumes: Crazy Stacy reports at `D:\nodaw\coproducer audio analysis\reports\json\Crazy_Stacy_audio_quality.json` and `Crazy_Stacy_repaired_audio_quality.json`; audio paths inside those JSON files; fallback `input/song/original.mp3` + one offline repair **only inside this bake script**, never the web API
- Produces: `demo.json` shape:

```json
{
  "title": "Crazy Stacy",
  "excerptSeconds": 45,
  "before": { "score": 70, "rating": "...", "file": "before.m4a", "metrics": {} },
  "after": { "score": 90, "rating": "...", "file": "after.m4a", "metrics": {} },
  "rows": [
    { "metric": "Score", "before": 70, "after": 90, "delta": 20 },
    { "metric": "Integrated LUFS", "before": -12.61, "after": -13.63, "delta": -1.02 }
  ]
}
```

Rows (in order): Score, Rating (delta empty string), Integrated LUFS, True peak dBTP, Dynamic range dB, Clipped samples, Noise floor dBFS, Phase correlation.

- [ ] **Step 1: Write `bake_demo.py`**

Logic:

1. `before_json` / `after_json` paths above; if missing, print error and exit 1.
2. Read metrics from JSON (source of truth for numbers).
3. Audio: `Path(before_json["track"]["audio"]["path"])` and after path. If missing, search `D:\nodaw\coproducer audio analysis\exports\repairs` for `*Crazy*Stacy*repaired*.wav` and skip baking m4a with a clear error (do not invent numbers; JSON can still be written from reports).
4. ffmpeg: `-ss 12 -t 45 -c:a aac -b:a 256k` on **both** files with identical `-ss` and `-t` so they stay sample-aligned. Output to `nodaw-web/demo/before.m4a` and `after.m4a`.
5. Write `demo.json` next to them.

- [ ] **Step 2: Run the baker**

Run: `py -3.11 "D:\Projects\coproducer\nodaw-web\tools\bake_demo.py"`

Expected: three files exist; `demo.json` score 70 / 90; clips 831 / 0. If original WAVs are gone, write JSON from reports and log that m4a must be produced from `original.mp3` via one local `run_auto_repair` then the same ffmpeg excerpt — still real engine output.

- [ ] **Step 3: Commit demo artifacts**

```bash
git -C "D:\Projects\coproducer" add nodaw-web/tools/bake_demo.py nodaw-web/demo
git -C "D:\Projects\coproducer" commit -m "feat: bake real engine before/after demo assets"
```

---

### Task 6: Homepage A/B section (remove browser-toy analyzer)

**Files:**
- Modify: `D:\Projects\coproducer\nodaw-web\index.html`

**Interfaces:**
- Consumes: `css/report.css`, `js/player.js`, `demo/demo.json`, `demo/before.m4a`, `demo/after.m4a`
- Produces: section `#ab` after `.rail`; nav links Overview / A/B / Analyze / Download; hero primary button → `#ab`, secondary → `analyze.html`

- [ ] **Step 1: Add fonts + CSS/JS links in `<head>`**

Keep existing Barlow/Inter for the hero. Add:

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Rajdhani:wght@500;700&family=Manrope:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/report.css">
```

End of body: `<script type="module" src="js/home-ab.js"></script>` (create this file in this task).

- [ ] **Step 2: Replace `<section id="analyze">` ... through its closing `</section>`** with:

```html
<section id="ab">
  <div class="wrap">
    <div class="head">
      <small>Real engine output</small>
      <h2>Before and <span>after repair.</span></h2>
      <p>This pair was analysed and repaired in CoProducer. A and B share one playhead — switch at the same sample. No clicks, no reload.</p>
    </div>
    <div class="cp-card">
      <div id="abPlayer" class="cp-player" data-mode="ab">
        <canvas class="cp-wave" width="1200" height="220"></canvas>
        <div class="cp-transport">
          <button type="button" class="cp-play">Play</button>
          <span class="cp-time">0:00</span>
          <div class="cp-ab">
            <button type="button" data-side="a" class="is-live">A Before</button>
            <button type="button" data-side="b">B Repaired</button>
          </div>
        </div>
      </div>
      <div class="table-scroll" style="margin-top:24px">
        <table class="cp-table" id="abTable">
          <thead>
            <tr><th>Metric</th><th>Before (analysed)</th><th>After (repaired)</th><th>Delta</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="cp-promo" style="margin-top:20px">
        <a class="cp-cta" href="analyze.html">Analyze your track</a>
        <span style="color:var(--cp-muted);font-family:var(--cp-mono);font-size:12px">Pro is $49 one-time</span>
      </p>
    </div>
  </div>
</section>
```

Delete the inline browser-analyzer `<script>` at the bottom of `index.html`.

Nav `.links` become:

```html
<a href="#overview">Overview</a>
<a href="#ab">A/B</a>
<a href="analyze.html">Analyze</a>
<a href="#screens">Screenshots</a>
```

Header CTA and hero “Try browser analyzer” → `analyze.html` with label `Analyze your track`. Other `#analyze` hrefs → `#ab` or `analyze.html` as above.

- [ ] **Step 3: Create `js/home-ab.js`**

```javascript
import { CoproducerPlayer } from './player.js';

const res = await fetch('demo/demo.json');
const demo = await res.json();
const tbody = document.querySelector('#abTable tbody');
for (const row of demo.rows) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${row.metric}</td><td>${row.before}</td><td>${row.after}</td><td>${row.delta ?? ''}</td>`;
  tbody.appendChild(tr);
}
const player = new CoproducerPlayer(document.getElementById('abPlayer'), { mode: 'ab' });
await player.load({ a: 'demo/before.m4a', b: 'demo/after.m4a' });
function syncLive() {
  const side = player.getSide();
  document.querySelectorAll('#abTable tbody tr').forEach((tr) => {
    tr.cells[1].classList.toggle('live', side === 'a');
    tr.cells[2].classList.toggle('live', side === 'b');
  });
  document.querySelectorAll('.cp-ab [data-side]').forEach((btn) => {
    btn.classList.toggle('is-live', btn.dataset.side === side);
  });
}
document.querySelectorAll('.cp-ab [data-side]').forEach((btn) => {
  btn.addEventListener('click', () => { player.setSide(btn.dataset.side); syncLive(); });
});
syncLive();
```

- [ ] **Step 4: Open `index.html` in a browser (or `py -3.11 -m http.server 5500` from nodaw-web). Confirm: table 70/90, A/B plays, toggle does not reset time.**

- [ ] **Step 5: Commit**

```bash
git -C "D:\Projects\coproducer" add nodaw-web/index.html nodaw-web/js/home-ab.js
git -C "D:\Projects\coproducer" commit -m "feat: replace browser meters with real A/B repair demo"
```

---

### Task 7: `analyze.html` + report client

**Files:**
- Create: `D:\Projects\coproducer\nodaw-web\analyze.html`
- Create: `D:\Projects\coproducer\nodaw-web\js\report.js`

**Interfaces:**
- Consumes: `public_analyze_payload` JSON from `POST ${API}/api/analyze`, `CoproducerPlayer` single mode, local `File`
- Produces: full report UI

`API` constant:

```javascript
export const apiBase = () => new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:8788';
```

- [ ] **Step 1: Write `analyze.html`**

Page chrome: same fonts/tokens as LUFS guide. Back link to `index.html`. Title: `Analyze your track | CoProducer`.

Structure:

1. `#engineStatus` (filled by health check)
2. Dropzone `input type=file accept=".wav,.mp3,.flac,.m4a,.aac,.ogg,.opus,.aiff,.aif,audio/*"`  + note `40 MB max`
3. `#report` hidden until success:
   - score + rating (upload)
   - `#uploadPlayer` single-mode player
   - findings list
   - streaming table if `streaming.length`
   - comparison table columns: Metric | Your upload | If repaired in CoProducer | Release target
   - `#planList` actions + cautions; if `!plan.needed` text `No automatic repair needed`
   - pricing card: `$49 one-time`, download + pricing links
4. Offline panel `#offline` with download + pricing (shown when health fails)

- [ ] **Step 2: Write `js/report.js`**

```javascript
import { CoproducerPlayer } from './player.js';

export const apiBase = () => new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:8788';

export function fmt(v, digits = 2) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(digits);
  return String(v);
}

export async function copyPromo(code) {
  await navigator.clipboard.writeText(code);
}

function cellClass(status) { return status === 'pass' ? 'pass' : status === 'off' ? 'off' : ''; }

export function renderVsTarget(tbody, rows) {
  tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.metric}</td>
      <td class="${cellClass(row.status_yours)}">${fmt(row.yours)}</td>
      <td class="${cellClass(row.status_projected)}">${fmt(row.projected)}</td>
      <td>${fmt(row.target)}</td>`;
    tbody.appendChild(tr);
  }
}
```

Wire `analyze.html` module script:

- On load: `fetch(apiBase()+'/health')`. If fail, show `#offline`, disable input.
- On file: if `file.size > 40*1024*1024` show error, return. Status text `Uploading → Analyzing with CoProducer engine → Building report`.
- `FormData` field name **`file`**. `POST /api/analyze`.
- On 200: `renderVsTarget`, findings, plan, promo, `new CoproducerPlayer(uploadPlayer,{mode:'single'}).load({ a: file })` via `file.arrayBuffer()` + `decodeAudioData` inside player `load` when given a `File`.
- Extend `CoproducerPlayer.load` in this task if needed: if `a instanceof File` or `Blob`, `decodeAudioData(await a.arrayBuffer())`.
- Pricing CTA links to pricing.html ($49 one-time).

Add a tiny node test in `js/report.test.mjs` asserting `fmt(null)==='—'` and `fmt(-14,1)==='-14.0'`.

- [ ] **Step 3: Run `node js/report.test.mjs` from nodaw-web — expect pass. Then start API + static server and POST a small wav if available.**

API: `py -3.11 web/server.py` from engine root.  
Site: `py -3.11 -m http.server 5500` from nodaw-web.  
Open `http://127.0.0.1:5500/analyze.html`. Health should read ok.

- [ ] **Step 4: Commit**

```bash
git -C "D:\Projects\coproducer" add nodaw-web/analyze.html nodaw-web/js/report.js nodaw-web/js/report.test.mjs nodaw-web/js/player.js
git -C "D:\Projects\coproducer" commit -m "feat: add engine-backed analyze report with projected repair stats"
```

---

### Task 8: Sitemap, pricing pointer, browser verification

**Files:**
- Modify: `D:\Projects\coproducer\nodaw-web\sitemap.xml`
- Modify: `D:\Projects\coproducer\nodaw-web\pricing.html` — under Pro: `Pro is $49 one-time.` Do not restyle the page.

**Interfaces:**
- Consumes: finished pages
- Produces: sitemap entry `https://myaiplug.github.io/coproducer-web/analyze.html` priority 0.9

- [ ] **Step 1: Add sitemap `<url>` for analyze.html**

- [ ] **Step 2: Browser checklist (desktop + 390px width)**

Homepage:

- [ ] `#ab` table shows real before/after (70/90 or the baked pair)
- [ ] Play, toggle A/B mid-bar, time does not jump
- [ ] Click waveform seeks; no click/pop
- [ ] Analyze CTA goes to `analyze.html`

Analyze:

- [ ] API down → offline + pricing CTA works
- [ ] API up, upload known file → score matches engine; middle column LUFS −14 / TP −1 when plan has loudnorm; score ≥ upload
- [ ] Empty-plan file → “No automatic repair needed”, middle equals left
- [ ] Upload player plays the **local** file only
- [ ] Tables scroll on 390px; no overflow of the page

- [ ] **Step 3: Commit**

```bash
git -C "D:\Projects\coproducer" add nodaw-web/sitemap.xml nodaw-web/pricing.html
git -C "D:\Projects\coproducer" commit -m "docs: list analyze page and $49 pricing"
```

---

## Spec coverage (self-review)

| Spec section | Task |
| Split pages / no upload on index | 6 |
| Hybrid API + static demo | 2, 5 |
| LUFS/vs-LANDR visual system | 4, 6, 7 |
| Crazy Stacy real numbers / bake fallback | 5 |
| Homepage table Before/After/Delta + player | 4, 6 |
| Analyze three-column table + plan list | 7 |
| Projection rules, no `run_auto_repair` | 1, 2 |
| Score floor | 1 |
| Player 8 ms / 5 ms / lookahead / color match | 3, 4 |
| Analyze local File decode | 7 |
| Pricing ($49) | 1 payload, 6, 7, 8 |
| Offline / 40 MB / busy | 2, 7, 8 |
| Path strip | 1, 2 |
| Sitemap | 8 |
