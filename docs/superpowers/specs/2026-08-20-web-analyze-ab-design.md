# CoProducer web: A/B demo + upload analysis report

Date: 2026-08-20
Status: approved design
Sites: `D:\Projects\coproducer\nodaw-web`
Engine: `D:\nodaw\coproducer audio analysis` (`WorkflowRunner`, `detect_repair_plan`)

## Goal

Two public surfaces:

1. **Homepage** (`index.html`) proves the product with a real analysed vs repaired track, A/B audio, and a stats table.
2. **Analyze** (`analyze.html`) lets a user upload a song. The same engine as the desktop app measures it. The report shows measured stats next to **projected** stats if that file were repaired in the CoProducer app, next to the streaming release target. A $49 one-time pricing note follows the table.

The analyze path **does not repair, render, or return a second audio file**. Projection is numeric only.

## Non-goals

- Cloud mastering or downloading a repaired mix from the website.
- Running Pedalboard/FFmpeg repair on uploaded files.
- Replacing the desktop app.
- Restyling comparison/guide pages already on disk.
- Browser-only fake meters presented as the CoProducer engine.

## Approach

**Split pages (option B).** Homepage is the A/B proof. Upload and report live on `/analyze.html`.

**Hybrid hosting.** Demo audio and `demo.json` are static (GitHub Pages always works). Uploads `POST` to a local/hosted Python API wrapping `WorkflowRunner.single()`. If the API is down, the dropzone says so and still offers download + pricing.

## Visual system

Match `guides/what-is-lufs.html` and `comparisons/vs-landr.html`:

| Token | Value |
| Background | `#020617` |
| Surface | `rgba(15,23,42,0.92)` |
| Border | `rgba(51,65,85,0.5)` |
| Cyan | `#22d3ee` |
| Emerald | `#10b981` |
| Orange | `#f97316` |
| Red | `#ef4444` |
| Gold | `#facc15` |
| Text | `#e2e8f0` |
| Muted | `#64748b` |
| Display | Rajdhani |
| Body | Manrope |
| Data | JetBrains Mono |

Index hero/nav may keep the existing CoProducer wordmark. New A/B block and all of `analyze.html` use this system. Tables are JetBrains Mono, 12px, hairline borders, uppercase 10px headers.

## Page map

```
index.html          marketing + A/B demo (no upload)
analyze.html        upload + engine report + pricing
guides/*            unchanged
comparisons/*       unchanged
demo/before.m4a     pre-baked original excerpt
demo/after.m4a      pre-baked repaired excerpt
demo/demo.json      real engine before/after + target rows
css/report.css      shared report + player + table styles
js/player.js        A/B + single-file waveform player
js/report.js        table render, promo copy, API client
web/server.py       lives in the engine repo (see API)
```

Nav on both pages: Overview, A/B (index `#ab`), Analyze (`analyze.html`), Download.

## Homepage A/B

Place the section after the hero rail, before screenshots.

Copy: this pair was analysed and repaired **in CoProducer** (offline). The table is real engine output, not a mock.

**Demo pair:** Crazy Stacy engine reports already on disk:

| | Before | After |
| Score | 70 | 90 |
| Rating | Usable after technical corrections | Release ready |
| Integrated LUFS | −12.61 | −13.63 |
| True peak | +0.33 dBTP | +0.04 dBTP |
| Clips | 831 | 0 |
| Dynamic range | 10.40 dB | 10.78 dB |

Bake a ~45 s excerpt of original + repaired into `demo/before.m4a` and `demo/after.m4a` (AAC 256 kbps, identical start time, identical length). `demo/demo.json` holds the full metric rows from the real JSON reports, not hand-typed approximations.

Audio sources (first that exists): `exports/repairs/Crazy Stacy_repaired.wav` plus its original path from the JSON; if those files are gone, run one offline `WorkflowRunner.single` + `run_auto_repair` on `input/song/original.mp3` and bake that pair instead. Never invent demo numbers.

**Table columns:** Metric | Before (analysed) | After (repaired) | Delta

Highlight the live A/B column. CTA: “Analyze your track” → `analyze.html`.

## Analyze page

1. Dropzone: WAV / MP3 / FLAC / M4A / AAC / OGG / OPUS / AIFF, 40 MB.
2. Status: *Uploading → Analyzing with CoProducer engine → Building report*.
3. Report: score ring (upload), summary, waveform of **the upload only**, findings, streaming table, then the three-column comparison, then the repair-plan list, then $49 pricing.

**Table columns:** Metric | Your upload | If repaired in CoProducer | Release target

Cell color: emerald if within spec, orange if notice, red if fail. Middle column is the projection. Right column is the app’s release spec, not a second measurement.

If `detect_repair_plan` is empty: middle equals left; copy: **No automatic repair needed**.

Offline API: dropzone disabled, message that the engine is not connected, download + pricing still visible.

## Projection model (no render)

Server only:

1. `WorkflowRunner.single(path)` — real measurement and scoring.
2. `detect_repair_plan(report, settings=settings)` — same detector as the app.
3. Project a metric bundle from the plan. Do **not** call `run_auto_repair`.

Use the plan’s `target_lufs` and `tp_ceiling` from settings (defaults −14.0 and −1.0).

| Plan action | Projected fields |
| `loudnorm` | LUFS → target; true peak → ceiling; sample peak → ceiling; RMS += (target − current LUFS); clip count → 0 |
| `true_peak_limit` only | LUFS unchanged; true peak → ceiling; sample peak → ceiling; clip count → 0 |
| `highpass` | DC → 0; if noise floor was in the rumble window, noise floor −3 dB (clamped); otherwise unchanged |
| Phase / stereo width | Unchanged (app does not auto-fix) |
| Spectral bands | Unchanged except highpass may mark sub-bass as improved in copy only, not invented dB |
| Score | Build a projected track dict, run `evaluate_track`, then apply the app score floor: `max(pre_score, projected_score)` |
| Rating | `rating(floored_score)` |

Always emit the plan’s `cautions` (clipping cannot restore transients; phase is mix work).

`vs_target` (right column) is fixed:

| Metric | Target | Pass when |
| Integrated LUFS | −14.0 | within 1.5 LU |
| True peak | −1.0 dBTP | ≤ −1.0 + 0.15 epsilon |
| Clipped samples | 0 | == 0 |
| Sample rate | ≥ 44100 Hz | ≥ 44100 |
| Phase correlation | ≥ 0.2 | ≥ 0.2 |
| Score | ≥ 90 | ≥ 90 |

Distance = yours − target (or projected − target in the middle column’s annotation). Frontend does not invent thresholds.

## Player

Shared `js/player.js` for homepage A/B and analyze (single buffer).

- Decode the full file(s) into `AudioBuffer` (entire excerpt/upload in memory).
- Dual sources for A/B, started at the same offset. Toggle by `GainNode` only. Never stop/recreate on A/B.
- A/B: 8 ms equal-power crossfade at `audioContext.currentTime`.
- Seek: click or drag the waveform; 5 ms fade-in at the new offset. Shared clock; A and B stay sample-aligned.
- Lookahead: schedule the next `BufferSource` ahead of `currentTime`; paint a brighter 3 s region in front of the playhead.
- Color map shared for A and B: low = cyan, mid = emerald, air = gold, clip zones = red. Same amplitude → same color on both files.
- Transport: play, pause, time readout. No clicks, pops, or skips.

Homepage uses two buffers from `demo/*.m4a`. Analyze uses one buffer decoded in the browser from the **local `File`** (`decodeAudioData`); the API never returns audio. Analyze does not offer an A/B of a repaired render.

## API

File: `D:\nodaw\coproducer audio analysis\web\server.py`

Default bind: `127.0.0.1:8788`. CORS: `*` (GitHub Pages + localhost). No beta gate.

| Method | Path | Role |
| GET | `/health` | `{ ok, engine, ffmpeg }` |
| POST | `/api/analyze` | multipart field `file` |

Limits: 40 MB, app extensions, one analysis at a time (503 + `Retry-After` if busy). Save to a temp dir, analyze, delete the file before responding. No audio URLs, no repair artifacts.

Frontend: `const API = new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:8788'`

### `POST /api/analyze` JSON

```json
{
  "score": 70,
  "rating": "Usable after technical corrections",
  "summary": "...",
  "track": { "audio": {}, "metrics": {} },
  "findings": [],
  "streaming": [],
  "plan": { "needed": true, "summary": "...", "actions": [], "cautions": [] },
  "projected": { "score": 90, "rating": "...", "metrics": {} },
  "vs_target": [
    {
      "metric": "Integrated LUFS",
      "yours": -12.61,
      "projected": -14.0,
      "target": -14.0,
      "distance_yours": 1.39,
      "distance_projected": 0.0,
      "status_yours": "off",
      "status_projected": "pass"
    }
  ],
  "promo": null
}
```

Strip local filesystem paths from `track.audio.path` before JSON leaves the server.

## Promo

Price: CoProducer Pro **$49 one-time**. Shown on `analyze.html` after a successful report, in the offline empty state, and as a quiet line under the homepage A/B CTA. Link the existing download CTA (`CoProducer-Setup` GitHub release) and `pricing.html`.

## Error handling

| Case | UI |
| Unsupported type / over 40 MB | Inline error, no request |
| API unreachable | Offline panel, download + pricing |
| Engine/FFmpeg failure | Server 500 `{ error }`, show message, keep dropzone |
| Busy | “Engine is analyzing another file”, retry |
| Decode failure in player | Disable transport, keep the table |

Do not leave temp uploads on disk after success or failure.

## Testing

- Homepage A/B: play, toggle A/B mid-bar (time unchanged), click-seek both directions, no audible click.
- `demo.json` numbers match the Crazy Stacy JSON reports.
- Analyze against a local API: known file (e.g. `input/song/original.mp3`) produces score/findings consistent with `WorkflowRunner.single` on that file.
- Projection: if plan includes loudnorm, projected LUFS is −14.0 and projected TP is −1.0; score ≥ upload score.
- Projection: empty plan → projected equals measured.
- Offline: stop the API, reload `analyze.html`, dropzone explains offline.
- Visual: desktop and 390px wide; tables scroll instead of overflowing.

## Implementation order

1. Shared `css/report.css` + table markup (match vs-LANDR).
2. `js/player.js` + homepage A/B wired to `demo/` (generate excerpt + `demo.json` from the real pair).
3. `web/server.py` + projection helper next to `detect_repair_plan`.
4. `analyze.html` + `js/report.js`.
5. Nav, sitemap, promo, offline state.
6. Browser verify homepage A/B and analyze happy path + offline.
