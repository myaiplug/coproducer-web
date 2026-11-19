# Earlybird voice commands on real human voices

The first thresholds (accept if the best phrase's log-prob is within 12 of the free transcript's, or its edit distance
is ≤ 0.3) were picked on synthetic TTS speech. This note covers tests on real recorded voices and the rule that replaced
the old one. All numbers come from the real browser pipeline: `stem-studio.html`,
`__studioUi.voiceCommands.recognise()`, headless Chrome, ONNX Runtime Web, CPU. No audio is committed. The scripts are in
`real-voices/` and download what they need.

## Data and licences

| Source | What was used | Licence | Size fetched |
|---|---|---|---|
| Speech Commands v2, test split (`danjacobellis/speech_commands_v2` on HF) | all 411 "stop" clips; 12 clips each of the other 34 words as negatives | CC BY 4.0 | ~30 MB (one parquet, deleted) |
| MLCommons Multilingual Spoken Words, en test split (`MLCommons/ml_spoken_words`, from Common Voice) | single-word clips: play 40, pause 13, export 21, mute 12, solo 40, bass 36, drums 30, vocals 33, kick 33, drop 40, the 40 | CC BY 4.0 | 818 MB streamed, 2.7 MB kept (`mswc_stream.py`) |
| People's Speech, test + validation (`MLCommons/peoples_speech`) | 247 random windows of 1.2–4 s from 3 parquet row groups (natural non-command speech) | CC-BY / CC-BY-SA | 39 MB |
| Kevin MacLeod: "Funkorama", "Acid Jazz", "Cold Funk" (Wikimedia Commons) | music beds for the mixes | CC BY 3.0 | 3 tracks |

* **SLURP was excluded.** Its audio is CC BY-NC 4.0 (non-commercial), even though its text is CC BY.
* **No openly licensed recordings of whole stem commands exist** ("mute the drums" spoken as one phrase). Multi-word
  commands are therefore **spliced**: real single words from *different* Common Voice speakers joined with
  40–120 ms gaps. Every one of them is labelled `spliced_cmd` and reported separately. They are harder and less
  natural than one person speaking.

## Method

* **Clips:** trimmed at -35 dB, normalised to RMS 0.05, padded with 0.25 s / 0.3 s of near-silence.
* **Categories** (clean counts):
  * `real_word`: 485 unspliced real commands (stop 411, play 40, export 21, pause 13).
  * `spliced_cmd`: 200 spliced commands.
  * `bare_word`: 224 stem/verb words said alone, which must be rejected (mute, solo, bass, drums, vocals, kick, drop).
  * `neg_word`: 408 other Speech Commands words.
  * `neg_speech`: 247 People's Speech windows.
* **Music mixes:** all categories except `bare_word` are also mixed with a random segment of one of the three tracks, at
  10, 5 and 0 dB speech-to-music SNR. That is 5,584 clips in total. The mixes are digital: no room acoustics and no
  speaker bleed through echo cancellation.
* **Split:** speaker-disjoint by hash of speaker / Common Voice client / recording.
  * 30% **tune**: 848 positive, 534 negative clip-conditions.
  * 70% **test**.
  * Thresholds were chosen on *tune only*. `test` was scored once with the chosen rule.
* **Grid search** (`tune.py`) over the distance threshold, the margin, a separate margin for one-word phrases, a
  top-2 confidence gap and an absolute score floor. The objective penalises a wrong action 3× a rejection:
  `correct/pos − 3·wrong/pos − false_accepts/neg`.

## Result: new rule

`decide()` in `js/voice-commands/grammar.js` with `DECISION` in `models.js`:

* Reject if the greedy transcript is empty.
* Otherwise accept the top phrase if its edit distance is ≤ 0.15, **or** its log-prob is within **8** of the free
  transcript's.
* The margin is **4** when the phrase is a single word (play / stop / pause / export / unsolo …).

On tune, a single-word margin of 3 tied with 4 (objective 0.731 vs 0.730). 4 was kept because it gives 7 more correct
answers for 1 more false accept. The confidence gap and score floor did not help.

### Test split (speaker-disjoint, never used for tuning), old → new

| category | clean | music 10 dB | music 5 dB | music 0 dB |
|---|---|---|---|---|
| real single-word commands, correct (n=333) | 93.1% → **91.3%** | 91.0% → **88.6%** | 86.5% → **83.2%** | 83.5% → **80.8%** |
| … wrong action | 6 → **3** | 14 → **6** | 18 → **10** | 18 → **7** |
| spliced multi-word commands, correct (n=140) | 70.0% → **58.6%** | 70.7% → **62.9%** | 68.6% → **54.3%** | 62.9% → **50.0%** |
| … wrong action | 14 → **5** | 14 → **8** | 16 → **5** | 26 → **11** |
| other words, false accepts (n=290) | 9.0% → **0.3%** | 20.3% → **0.7%** | 22.4% → **1.7%** | 27.9% → **0.3%** |
| natural speech, false accepts (n=247) | 1.6% → **0.0%** | 2.0% → **0.0%** | 2.8% → **0.4%** | 4.5% → **0.8%** |
| bare stem words, false accepts (n=162) | 27.2% → **1.2%** | – | – | – |

Clean test, per word (new rule):

| command | correct |
|---|---|
| stop | 266/284 |
| play | 17/24 |
| pause | 8/10 |
| export | 13/15 |
| spliced "mute …" | 41/84 |
| spliced "solo …" | 41/56 |

The test numbers were computed by replaying the logged candidate scores through the new rule. Every third test clip (1,401) was then re-run in the browser with the shipped code: all 1,401 decisions matched the replay exactly.

On the TTS set from the PR, the new rule scores 203/210 correct (was 210/210), with 0/80 false accepts.

**What it means:**

* The old rule false-accepted real speech badly. Examples from the real clips:
  * "up" and "dog" heard as *stop*.
  * "bass" heard as *play* or *pause*.
  * "solo" alone heard as *solo vocals*.
* The new rule fixes that.
* The cost is more rejections ("didn't catch that"), mostly on the spliced phrases. With push-to-talk a rejection
  costs a retry, while a false accept changes the mix.

## Caveats

* **Multi-word results are from splices across speakers**, not natural phrases. Real one-speaker phrases with
  coarticulation are probably easier. Use `voice-commands-test.html` to measure your own voice.
* **The single-word clips are 1-second Speech Commands recordings and automatic Common Voice word cuts.** Some cuts
  are clipped or include part of a neighbouring word.
* **Small samples:** play, pause and export have only 10–24 test clips each. "stop" dominates the single-word numbers.
* **People's Speech is in Earlybird's training family.** Only its test/validation splits were used.
* **The music mixes are digital sums**, not a mic in a room with monitors.

## Re-running

```
# needs: python with pyarrow, huggingface_hub, soundfile, scipy; ffmpeg; node + playwright-core; Chrome
python mswc_stream.py                          # MSWC words -> mswc/
# fetch Speech Commands / People's Speech / music into sc/, ps2/, music/ (see table above)
python build.py && python mix.py && python add_ps2.py   # -> set/*.f32, set/manifest_all.json
ln -s "$PWD/set" ../../../_rv && (cd ../../.. && python3 -m http.server 8124 --bind 127.0.0.1 &)
node rv_eval.mjs set/manifest_all.json browser_all.jsonl
python tune.py      # grid on the tune split
python heldout.py   # old vs new rule on the test split
```

`build.py` still holds an older People's Speech step (`ps/`). Its window file names collided, so `add_ps2.py`
replaces it with uniquely named windows (`ps2/`). Delete the `ps` step if you rebuild from scratch.
