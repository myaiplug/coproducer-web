#!/usr/bin/env python3
"""Build the free "Pre-release master checklist": the HTML page (blog/pre-release-master-checklist.html)
and the branded PDF (blog/downloads/Lacquer-Pre-release-Master-Checklist.pdf).

One content list below drives both. Re-run this after editing it (the PDF needs google-chrome headless).
    python3 scripts/build_checklist.py            # page + PDF
    python3 scripts/build_checklist.py --no-pdf   # page only
Links to essays are checked against blog/*.html so a renamed essay fails loudly.
The site origin lives in BASE (the domain-move script rewrites it, then re-runs this)."""
from __future__ import annotations

import html
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOG = ROOT / "blog"
BASE = "https://coproducer.nodawlabs.com"
PAGE = "pre-release-master-checklist.html"
PDF = "downloads/Lacquer-Pre-release-Master-Checklist.pdf"
UPDATED = "2026-11-04"
UPDATED_HUMAN = "4 November 2026"
EBU = "https://tech.ebu.ch/docs/r/r128.pdf"
ITU = "https://www.itu.int/rec/R-REC-BS.1770"
SPOTIFY = "https://support.spotify.com/us/artists/article/loudness-normalization/"
AES = "https://aes.org/community/technical-council/technical-document-aestd1008/"
ISRC_HANDBOOK = "https://isrc.ifpi.org/images/downloads/ISRC_Handbook.pdf"
ANALYZE = "analyze.html?check=lufs&utm_source=journal&utm_medium=checklist&utm_campaign=pre-release-master-checklist"

# (slug, label) tuples are essays; strings in "checks" are plain items.
SECTIONS = [
    {
        "id": "loudness", "n": "01", "title": "Loudness",
        "lede": "The store measures the whole file, not the chorus. Measure the exported file the way a store would, then decide.",
        "checks": [
            "Measure <strong>integrated LUFS on the exported file</strong>, not the session. Whole song, edges included.",
            "Aim inside <strong>−14 LUFS ± 1.5 LU</strong>. That is the lane CoProducer scores against. Spotify normalizes to −14 by default; Apple Music is commonly reported near −16, and YouTube, TIDAL and Amazon Music near −14.",
            "Too hot? <strong>Turn the mix down before the limiter</strong>, not after another squash. A louder master is turned down on playback, not played louder.",
            "Too quiet? Fine for dynamic music, but some services turn quiet files up, and the noise floor comes with them.",
            "Read <strong>short-term LUFS beside integrated</strong> to see what the chorus does. Integrated is the contract; short-term is the diagnostic.",
            "Releasing a set? <strong>Measure the album as a group</strong> so no song jumps out of the run.",
            "Match a reference <strong>as a local file</strong>, never a streamed copy that the store has already re-leveled.",
        ],
        "essays": [
            ("why-streaming-turns-loud-masters-down", "Why streaming platforms turn loud masters down"),
            ("leading-silence-steals-integrated-lufs", "The silence at the top of your bounce steals LUFS"),
            ("integrated-lufs-hides-the-chorus", "Integrated LUFS hides how loud the chorus is"),
            ("short-term-lufs-is-not-your-target", "Short-term LUFS is not your target"),
            ("album-consistency-in-one-meter", "Album consistency in one meter"),
            ("turn-the-mix-down-before-you-limit", "Turn the mix down before you limit"),
        ],
    },
    {
        "id": "true-peak", "n": "02", "title": "True peak",
        "lede": "A WAV that never touches 0 dBFS can still clip after MP3 or AAC. True peak is the number that belongs on the release sheet.",
        "checks": [
            "Final file at <strong>−1.0 dBTP or lower</strong> true peak. Spotify asks for below −1 dBTP, and below −2 dBTP when a master is louder than −14 LUFS. Amazon Music is often reported stricter.",
            "<strong>Zero clipped samples.</strong> Clipping baked into a fixed-point file cannot be undone.",
            "The <strong>true-peak limiter goes last</strong>, after any gain, fade or loudness change. Re-measure after every move.",
            "Turn on <strong>oversampling</strong> on saturators and clippers that sit before the limiter.",
            "Encode once to AAC or MP3, then <strong>listen and re-measure the encode</strong>. That is closer to what the store plays.",
        ],
        "essays": [
            ("true-peak-is-what-codecs-clip", "True peak is what codecs clip"),
            ("reencoding-eats-true-peak-headroom", "Why does my master clip after MP3 or AAC?"),
            ("when-not-to-reach-for-the-limiter", "When not to reach for the limiter"),
            ("saturator-sounds-harsh-turn-on-oversampling", "Saturator making the highs harsh? Turn on oversampling"),
        ],
    },
    {
        "id": "mono-phase", "n": "03", "title": "Mono and phase",
        "lede": "Phones, clubs and smart speakers collapse stereo. A wide chorus that vanishes in mono is a delivery risk, not a creative choice.",
        "checks": [
            "Phase correlation stays <strong>at or above about 0.2</strong> (CoProducer fails lower). Fully mono sits near 1.0; you do not need that.",
            "<strong>Fold to mono and listen</strong>: vocal, kick, bass and snare should all still be there, only narrower.",
            "Keep the lowest octaves <strong>mostly centered</strong>. Check the polarity and timing of layered kicks and 808s.",
            "Check <strong>left versus right balance</strong>, band by band, if the mix leans.",
            "Audition mono <strong>after every width move</strong>: wideners, copy-pasted doubles, mid/side tricks.",
        ],
        "essays": [
            ("phase-correlation-and-mono", "What does a phase correlation meter show? How to read −1 to +1"),
            ("wide-mixes-fail-in-mono", "Wide mixes fail in mono"),
            ("mix-leans-to-one-side-check-the-balance-band-by-band", "Mix leans to one side? Check the balance band by band"),
            ("808-disappears-on-phone-speakers", "Why your 808 disappears on phone speakers"),
        ],
    },
    {
        "id": "tails-fades", "n": "04", "title": "Tails, fades and edges",
        "lede": "Most last-minute export disasters are at the first and last second of the file.",
        "checks": [
            "<strong>Let the tail ring.</strong> Export past the last note so reverb and delay decay to silence instead of getting chopped.",
            "Put the <strong>fade-out after the limiter</strong> and curve it, so the limiter does not pump the fade.",
            "<strong>Open and close cleanly</strong>: no click at the first sample, no stray seconds of silence. Trim the head, then measure again.",
            "<strong>Fade every edit</strong>. A cut mid-wave is a click.",
            "Releasing a gapless album? <strong>Encode it and check the joins</strong>, because MP3 and AAC can add gaps.",
            "Listen to the <strong>first three and last ten seconds</strong> of the exported file on speakers.",
        ],
        "essays": [
            ("song-ending-cut-off-on-export-let-the-tail-ring", "Song ending cut off when you export? Let the tail ring"),
            ("fade-out-sounds-abrupt-curve-it-and-fade-after-the-limiter", "Fade-out sounds abrupt? Curve it and fade after the limiter"),
            ("clicks-at-edit-points-fade-every-cut", "Clicks at your edit points? Fade every cut"),
            ("gapless-album-gaps-after-mp3-or-aac", "Why your gapless album gets gaps after MP3 or AAC"),
        ],
    },
    {
        "id": "export", "n": "05", "title": "Sample rate, bit depth and export",
        "lede": "Boring, visible, non-negotiable. These are the settings a distributor checks before it ever hears the song.",
        "checks": [
            "Export at your <strong>session sample rate, never below 44.1 kHz</strong>. Do not upsample a lower-rate file to look better.",
            "If the portal needs a different rate, <strong>convert once</strong> with a high-quality sample-rate converter on the final bounce.",
            "<strong>24-bit WAV or FLAC</strong> unless the distributor asks for 16-bit. Going down to 16-bit? <strong>Dither once</strong>, at the very last step. No dither is needed at 24-bit.",
            "<strong>Normalize-on-export off</strong>, along with any export-time loudness or gain adjustment.",
            "A real master, not an <strong>MP3 renamed MASTER</strong>. One interleaved stereo file unless the portal asks for split mono.",
            "Name it so nobody has to guess: <code>Title_master_48k_24b.wav</code>.",
            "<strong>Re-open the exported file</strong> and measure that, not the session.",
        ],
        "essays": [
            ("sample-rate-and-bit-depth-for-delivery", "Sample rate and bit depth are delivery hygiene"),
            ("normalize-on-export-turn-it-off-for-mastering", "Should you normalize on export? Turn it off"),
            ("sample-plays-at-wrong-pitch-sample-rate-mismatch", "Sample playing at the wrong speed or pitch?"),
            ("how-much-headroom-to-leave-for-mastering", "How much headroom to leave for mastering"),
        ],
    },
    {
        "id": "metadata", "n": "06", "title": "Metadata and ISRC basics",
        "lede": "Metadata is how a recording gets paid and found. Fix it before upload, because changing it afterwards is slow.",
        "checks": [
            "<strong>ISRC</strong> is a 12-character code for one recording: country (2), registrant (3), year (2), then a 5-digit designation. Hyphens are for human display only. Your distributor can assign one if you do not have your own.",
            "<strong>One ISRC per recording.</strong> The same recording re-released or put on a compilation keeps its code. A whole-file level change, EQ, dither or sample-rate change does not need a new one. A remix or an edited (for example, clean) version does.",
            "<strong>UPC/EAN identifies the release</strong> (single, EP or album), not the track. Distributors normally issue it.",
            "Spell <strong>title, artist and featured artists</strong> identically everywhere. Tag versions consistently: (Clean), (Instrumental), (Radio Edit).",
            "Writers and <strong>splits agreed in writing</strong> before release. Set the explicit flag honestly.",
            "<strong>Cover art</strong>: square, high-resolution (3000 × 3000 px is a common request, so check your distributor), and free of URLs, prices or storefront logos.",
            "Keep a <strong>one-row release log</strong>: title, ISRC, UPC, file name, LUFS, true peak, date sent.",
        ],
        "essays": [
            ("clean-version-of-a-song-mute-reverse-or-replace", "Making a clean version? Edit the vocals, keep the length"),
            ("432-hz-release-checklist", "Before a 432 version ships: the release checklist"),
        ],
    },
    {
        "id": "final-proof", "n": "07", "title": "The final proof",
        "lede": "The last ten minutes before you press send.",
        "checks": [
            "<strong>Measure the file you will upload</strong>, then save the report next to it. HTML, JSON or TXT: whichever you will actually find in a year.",
            "All six gates green: <strong>LUFS in lane, true peak ≤ −1.0, clips 0, sample rate ≥ 44.1 kHz, phase ≥ 0.2</strong>, and a score you trust.",
            "Listen once on a <strong>phone speaker, in earbuds, and in mono</strong>. If it still feels right, it is.",
            "Archive the <strong>session, stems and the exact file you sent</strong>, with the date.",
            "Upload with <strong>time to spare</strong>. A rejected file late on a Friday is a rough way to find a typo.",
        ],
        "essays": [
            ("release-checklist-that-matches-the-meter", "A release checklist that matches the meter"),
            ("why-three-report-formats", "What should a loudness report include?"),
            ("how-to-read-a-coproducer-score", "What does a mix score mean?"),
        ],
    },
]

GATES = [
    ("Integrated LUFS", "−14 ± 1.5", "Gain first, not another limiter"),
    ("True peak", "≤ −1.0 dBTP", "True-peak limiter last, re-measure"),
    ("Clipped samples", "0", "Back to the unclipped mix"),
    ("Sample rate", "≥ 44.1 kHz", "Re-export at a legal rate"),
    ("Phase correlation", "≥ 0.2", "Mix work, not mastering work"),
]

TITLE = "Pre-release master checklist: LUFS, true peak, mono, export and ISRC"
DESC = ("A free one-page pre-release master checklist: loudness and LUFS targets, true peak, mono and phase, "
        "tails and fades, sample rate, dither and export settings, ISRC and metadata basics. Download the PDF.")


def e(s: str) -> str:
    return html.escape(s, quote=True)


def check_links() -> None:
    bad = []
    for sec in SECTIONS:
        for slug, _ in sec["essays"]:
            if not (BLOG / f"{slug}.html").exists():
                bad.append(slug)
    if bad:
        sys.exit("build_checklist: unknown essay slug(s): " + ", ".join(bad))


def essay_li(slug: str, label: str, absolute: bool) -> str:
    href = f"{BASE}/blog/{slug}.html" if absolute else f"{slug}.html"
    return f'<li><a href="{href}">{e(label)}</a></li>'


def sections_html(absolute: bool) -> str:
    out = []
    for s in SECTIONS:
        items = "\n".join(f'<li><span class="box" aria-hidden="true"></span><span>{c}</span></li>' for c in s["checks"])
        reads = "\n".join(essay_li(sl, lb, absolute) for sl, lb in s["essays"])
        out.append(f"""<section class="ck" id="{s['id']}">
<h2><span class="ck-n">{s['n']}</span>{e(s['title'])}</h2>
<p class="ck-lede">{e(s['lede'])}</p>
<ul class="ck-list">
{items}
</ul>
<p class="ck-more">Go deeper</p>
<ul class="ck-reads">
{reads}
</ul>
</section>""")
    return "\n".join(out)


def gates_table() -> str:
    rows = "\n".join(f"<tr><td>{e(a)}</td><td>{e(b)}</td><td>{e(c)}</td></tr>" for a, b, c in GATES)
    return f"""<table class="gates"><thead><tr><th>Gate</th><th>Pass</th><th>If it fails</th></tr></thead><tbody>
{rows}
</tbody></table>"""


def sources_html() -> str:
    return (f'<p class="src">Sources: <a href="{ITU}">ITU-R BS.1770</a> (loudness and true-peak measurement); '
            f'<a href="{EBU}">EBU R 128</a>; <a href="{SPOTIFY}">Spotify for Artists, loudness normalization</a>; '
            f'<a href="{AES}">AES TD1008</a>; <a href="{ISRC_HANDBOOK}">IFPI ISRC Handbook</a>. '
            "Platform figures for Apple Music, YouTube, TIDAL, Amazon Music and Deezer are commonly reported values, not "
            "numbers those services publish, and services change them. Treat the lane as a safe default, not a law.</p>")


def page_html() -> str:
    url = f"{BASE}/blog/{PAGE}"
    og = f"{BASE}/blog/img/brand/lacquer-og.jpg"
    pdf_abs = f"{BASE}/blog/{PDF}"
    ld_article = {
        "@context": "https://schema.org", "@type": "Article", "headline": TITLE, "description": DESC,
        "datePublished": UPDATED, "dateModified": UPDATED,
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "image": {"@type": "ImageObject", "url": og, "width": 1200, "height": 630},
        "author": {"@type": "Organization", "name": "NoDAW Labs", "url": f"{BASE}/", "logo": f"{BASE}/assets/og-default.jpg"},
        "publisher": {"@type": "Organization", "name": "NoDAW Labs", "url": f"{BASE}/", "logo": f"{BASE}/assets/og-default.jpg"},
        "isPartOf": {"@type": "Blog", "name": "Lacquer — CoProducer Journal", "url": f"{BASE}/blog/index.html"},
        "keywords": ["pre-release checklist", "master checklist", "LUFS", "true peak", "ISRC", "export settings"],
        "speakable": {"@type": "SpeakableSpecification", "cssSelector": [".answer", "h1"]},
    }
    ld_crumb = {
        "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "CoProducer", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": "Lacquer Journal", "item": f"{BASE}/blog/index.html"},
            {"@type": "ListItem", "position": 3, "name": "Pre-release master checklist", "item": url},
        ],
    }
    import json
    jl = lambda o: '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False, separators=(",", ":")) + "</script>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width,initial-scale=1" name="viewport"/>
<title>{e(TITLE)} | Lacquer</title>
<meta content="{e(DESC)}" name="description"/>
<meta content="NoDAW Labs" name="author"/>
<meta content="#050308" name="theme-color"/>
<meta content="index,follow,max-image-preview:large" name="robots"/>
<link href="{url}" rel="canonical"/>
<link rel="alternate" type="application/rss+xml" title="Lacquer — CoProducer Journal" href="{BASE}/blog/rss.xml"/>
<link rel="icon" href="../favicon.ico" sizes="48x48"/>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg"/>
<link rel="apple-touch-icon" href="../assets/apple-touch-icon.png"/>
<link rel="manifest" href="../site.webmanifest"/>
<link href="{BASE}/llms.txt" rel="alternate" title="llms.txt" type="text/plain"/>
<meta content="article" property="og:type"/>
<meta content="{e(TITLE)}" property="og:title"/>
<meta content="{e(DESC)}" property="og:description"/>
<meta content="{url}" property="og:url"/>
<meta content="{og}" property="og:image"/>
<meta content="Lacquer — CoProducer Journal" property="og:site_name"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="{e(TITLE)}" name="twitter:title"/>
<meta content="{e(DESC)}" name="twitter:description"/>
<meta content="{og}" name="twitter:image"/>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500;1,600&amp;family=Figtree:wght@400;500&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet" media="print" onload="this.media='all'"/><noscript><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500;1,600&amp;family=Figtree:wght@400;500&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet"/></noscript>
<link href="css/journal.css" rel="stylesheet"/>
{jl(ld_article)}{jl(ld_crumb)}
</head>
<body>
<header class="top">
<a class="mark" href="../index.html"><em>Co</em>Producer</a>
<nav aria-label="Primary" class="nav">
<a href="index.html">Journal</a>
<a href="../index.html#ab">A/B</a>
<a href="../analyze.html">Analyze</a>
</nav>
<a class="cta" href="../analyze.html">Check a mix</a>
</header>
<main class="checklist-page" id="main">
<header class="ck-head">
<p class="kicker">Free checklist · Updated {UPDATED_HUMAN}</p>
<h1>Pre-release master checklist</h1>
<p class="meta">NoDAW Labs · Lacquer</p>
</header>
<p class="answer">Before you upload a master, measure the exported file and confirm five things: integrated LUFS inside −14 ± 1.5, true peak at or below −1.0 dBTP, zero clipped samples, a sample rate of at least 44.1 kHz, and phase correlation of at least 0.2. Then check the tails, the export settings and the metadata below.</p>
<p class="ck-dl"><a class="ck-btn" href="{PDF}" download>Download the PDF</a><span>One tidy file you can keep next to the bounce folder.</span></p>
<h2 class="ck-gates-h">The five measured gates</h2>
{gates_table()}
{sections_html(False)}
<aside class="check-cta ck-check" data-lq-check="lufs"><p class="check-k">Check your own mix</p><p class="check-p">Drop a bounce into the analyzer and read it against these gates. It runs on your device.</p><p><a class="check-btn" href="../{ANALYZE}">Open the analyzer →</a></p></aside>
{sources_html()}
<p class="ck-contact">Spotted a number that has moved, or a step we missed? Write to <a href="mailto:NoDAW@nodawlabs.com">NoDAW@nodawlabs.com</a>. <a href="methodology.html">How we test, cite and correct</a>.</p>
</main>
<footer class="site"><span>Lacquer · CoProducer Journal</span><span><a href="index.html">All essays</a> · <a href="about.html">About</a> · <a href="methodology.html">Methodology</a></span></footer>
</body>
</html>
"""


def pdf_source(part: str) -> str:
    PAGE_MARGIN = "0" if part == "cover" else "0.7in 0.75in 0.8in"
    PAGE_BG = "#070508" if part == "cover" else "#f7f1e8"
    pdf_blocks = sections_html(True)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Lacquer · Pre-release master checklist</title>
<style>
@page {{ size: Letter; margin: {PAGE_MARGIN}; background: {PAGE_BG}; }}
* {{ box-sizing: border-box; }}
html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
body {{ margin: 0; font-family: 'Figtree', sans-serif; color: #2a2230; font-size: 10.4pt; line-height: 1.45; }}
a {{ color: #8a3aa6; text-decoration: none; }}
.cover {{ width: 8.5in; height: 11in; background: #070508; color: #f3eadf; position: relative; overflow: hidden; page-break-after: always;
  background-image: radial-gradient(700px 420px at 85% 8%, rgba(232,76,255,.30), transparent 60%), radial-gradient(520px 380px at 0% 100%, rgba(196,165,116,.20), transparent 62%); }}
.cover .in {{ position: absolute; left: .85in; right: .85in; top: .9in; bottom: .8in; display: flex; flex-direction: column; justify-content: space-between; }}
.mark {{ font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 600; font-size: 26pt; }}
.mark em {{ color: #e84cff; }}
.k {{ font-family: 'JetBrains Mono', monospace; font-size: 8pt; letter-spacing: .24em; text-transform: uppercase; color: #c4a574; }}
.cover h1 {{ font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 500; font-size: 62pt; line-height: .92; letter-spacing: -.02em; margin: 14pt 0 18pt; }}
.cover h1 b {{ color: #e84cff; font-weight: 500; font-style: normal; }}
.cover p.sub {{ font-size: 13pt; color: #cfc3b6; max-width: 4.9in; margin: 0; }}
.rule {{ width: 1.1in; height: 2px; background: #c4a574; margin: 22pt 0; }}
.cover .foot {{ font-family: 'JetBrains Mono', monospace; font-size: 7.6pt; letter-spacing: .14em; text-transform: uppercase; color: #8a7e8c; line-height: 1.8; }}
.cover .gate-strip {{ display: flex; gap: 8pt; flex-wrap: wrap; margin-top: 8pt; }}
.cover .gate-strip span {{ border: 1px solid rgba(196,165,116,.5); padding: 5pt 9pt; font-family: 'JetBrains Mono', monospace; font-size: 7.6pt; letter-spacing: .08em; color: #f3eadf; }}
.cover .gate-strip i {{ color: #c9ff4d; font-style: normal; }}
.body h2.top {{ font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 500; font-size: 28pt; margin: 0 0 6pt; color: #1b1420; }}
.k2 {{ font-family: 'JetBrains Mono', monospace; font-size: 7.6pt; letter-spacing: .2em; text-transform: uppercase; color: #9a7a43; }}
table.gates {{ width: 100%; border-collapse: collapse; margin: 10pt 0 6pt; font-size: 9.4pt; }}
table.gates th {{ text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 7pt; letter-spacing: .12em; text-transform: uppercase; color: #8a7e8c; padding: 6pt 6pt; border-bottom: 1.4px solid #c4a574; }}
table.gates td {{ padding: 6pt 6pt; border-bottom: 1px solid #e0d4c0; }}
table.gates td:nth-child(2) {{ font-family: 'JetBrains Mono', monospace; font-weight: 500; color: #1b1420; }}
.ck {{ break-inside: avoid; margin: 16pt 0 0; padding-top: 10pt; border-top: 1px solid #d8c9ac; }}
.ck h2 {{ font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 500; font-size: 19pt; margin: 0 0 3pt; color: #1b1420; }}
.ck-n {{ font-family: 'JetBrains Mono', monospace; font-style: normal; font-size: 8pt; letter-spacing: .14em; color: #c43fe0; margin-right: 8pt; }}
.ck-lede {{ margin: 0 0 7pt; color: #5a4f5c; font-style: italic; }}
ul {{ list-style: none; padding: 0; margin: 0; }}
.ck-list li {{ display: flex; gap: 8pt; padding: 3.2pt 0; }}
.box {{ flex: 0 0 9pt; height: 9pt; border: 1.2px solid #9a7a43; margin-top: 3pt; border-radius: 1.5pt; }}
.ck-more {{ font-family: 'JetBrains Mono', monospace; font-size: 6.8pt; letter-spacing: .2em; text-transform: uppercase; color: #9a7a43; margin: 7pt 0 2pt; }}
.ck-reads li {{ font-size: 8.8pt; padding: 1pt 0; }}
code {{ font-family: 'JetBrains Mono', monospace; font-size: .86em; background: #ece1cf; padding: 0 3pt; }}
.src {{ font-size: 7.8pt; color: #6b5f6c; margin-top: 18pt; border-top: 1px solid #d8c9ac; padding-top: 8pt; }}
.end {{ margin-top: 14pt; padding: 12pt 14pt; background: #070508; color: #f3eadf; }}
.end b {{ font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 500; font-size: 15pt; }}
.end p {{ margin: 3pt 0 0; color: #cfc3b6; font-size: 9.2pt; }}
.end a {{ color: #c4a574; }}
</style></head><body>
<section class="cover"><div class="in">
<div><div class="mark"><em>Co</em>Producer</div><div class="k" style="margin-top:6pt">Lacquer · The Journal</div></div>
<div>
<div class="k">A free checklist · {UPDATED_HUMAN}</div>
<h1>Pre-release<br><b>master</b> checklist</h1>
<div class="rule"></div>
<p class="sub">Loudness, true peak, mono, tails, export settings and the metadata basics. Run it on the exported file, then press send.</p>
<div class="gate-strip"><span>LUFS <i>−14 ± 1.5</i></span><span>TRUE PEAK <i>≤ −1.0 dBTP</i></span><span>CLIPS <i>0</i></span><span>RATE <i>≥ 44.1 kHz</i></span><span>PHASE <i>≥ 0.2</i></span></div>
</div>
<div class="foot">NoDAW Labs · Lacquer<br>{BASE.replace('https://','')}/blog/<br>NoDAW@nodawlabs.com</div>
</div></section>
<section class="body">
<div class="k2">Start here</div>
<h2 class="top">The five measured gates</h2>
<p style="margin:0 0 4pt">Measure the <strong>exported file</strong>, the one you will upload. All five should pass. These are the same gates CoProducer scores.</p>
{gates_table()}
{pdf_blocks}
<div class="end"><b>Measure your own file.</b><p>Drop a bounce into the <a href="{BASE}/{ANALYZE}">CoProducer analyzer</a> and read it against these gates. It runs on your device. Every item above links to a Lacquer essay at <a href="{BASE}/blog/index.html">{BASE.replace('https://','')}/blog/</a>.</p></div>
{sources_html()}
</section></body></html>"""


def build_pdf() -> None:
    chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if Path(p).exists()), None)
    if not chrome:
        sys.exit("build_checklist: no headless Chrome found; use --no-pdf")
    out = BLOG / PDF
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        parts = []
        for part in ("cover", "body"):
            src = pdf_source(part)
            if part == "cover":
                src = re.sub(r'<section class="body">.*</section></body>', "</body>", src, flags=re.S)
            else:
                src = re.sub(r'<section class="cover">.*?</section>\n', "", src, count=1, flags=re.S)
                src = src.replace("page-break-after: always;", "")
            f = Path(d) / f"{part}.html"
            f.write_text(src, encoding="utf-8")
            o = Path(d) / f"{part}.pdf"
            subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                            f"--print-to-pdf={o}", f"file://{f}"], check=True, capture_output=True, timeout=120)
            parts.append(str(o))
        subprocess.run(["pdfunite", *parts, str(out)], check=True)
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")


def main() -> None:
    check_links()
    (BLOG / PAGE).write_text(page_html(), encoding="utf-8")
    print(f"wrote blog/{PAGE}")
    if "--no-pdf" not in sys.argv:
        build_pdf()


if __name__ == "__main__":
    main()
