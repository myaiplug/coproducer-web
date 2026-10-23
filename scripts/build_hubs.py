#!/usr/bin/env python3
"""Build the Lacquer topic hubs (blog/topics/*.html), the "Keep reading" block
on every essay, the topic chips on the blog index and the hub sitemap entries.
Idempotent. Edit TOPICS to add essays to a hub (order = reading path)."""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://myaiplug.github.io/coproducer-web"
BLOG = ROOT / "blog"
TODAY = "2026-10-19"

TOPICS = [
    {
        "slug": "loudness-and-lufs",
        "name": "Loudness & LUFS",
        "title": "Loudness & LUFS: how streaming measures your master",
        "description": "Lacquer essays on LUFS and loudness normalization: integrated vs short-term, crest factor, streamed references, quiet masters and album loudness.",
        "lede": "Loudness is a contract with the store, not a contest. These essays explain what the meter is actually reading before you reach for another limiter.",
        "intro": [
            "Loudness is the number a store reads before anyone hears your record. Streaming services measure integrated loudness over the whole file with the ITU-R BS.1770 method and turn each track up or down toward a playback reference: Spotify documents −14 LUFS, and Apple’s Sound Check is commonly reported near −16. A −8 LUFS master is not played louder than a −14 one. It is turned down until it matches, and whatever you crushed to get there stays crushed.",
            "The essays here separate the meters people confuse: integrated versus short-term and momentary loudness, loudness versus crest factor, and the quiet intros and fades that drag the whole-song number down. They also cover the traps that come from comparing against platforms instead of files: streamed references that were already normalized, quiet masters whose noise floor gets lifted, album sequences that need one loudness lane, and vertical video that plays by different rules. Start with why streaming turns loud masters down, then read the meter pieces in order.",
        ],
        "essays": [
            "why-streaming-turns-loud-masters-down", "short-term-lufs-is-not-your-target", "integrated-lufs-hides-the-chorus",
            "leading-silence-steals-integrated-lufs", "dont-match-a-streamed-reference", "reference-matching-without-guesswork",
            "crest-factor-is-not-loudness", "quiet-masters-and-noise-floor", "album-consistency-in-one-meter",
            "vertical-video-is-a-loudness-trap",
            "mix-sounds-better-louder-pick-one-monitor-level",
        ],
    },
    {
        "slug": "true-peak-limiting-and-delivery",
        "name": "True peak, limiting & delivery",
        "title": "True peak, limiting & delivery: from mix bus to upload",
        "description": "Lacquer essays on true peak, headroom, limiters and clippers, sample rate, gapless encoding and release checklists for delivering a master.",
        "lede": "True peak is what the codec sees after it rebuilds your waveform. This path follows a master from the mix bus to the upload form.",
        "intro": [
            "True peak is what a codec sees after it rebuilds the waveform, not the sample peaks your DAW draws. A file whose samples stop just under 0 dBFS can still produce overs once it is encoded to AAC or Opus, which is why CoProducer’s delivery gate sits at −1.0 dBTP and why every lossy re-encode deserves a little extra margin.",
            "This path follows a master from the mix bus to the upload form: how much headroom to leave for mastering, why you turn the mix down before the limiter, when a clipper or one more limiter is the wrong tool, and what sample rate and bit depth distributors actually want. It ends with the delivery paperwork: gapless album encoding, a release checklist that uses the same gates as the meter, how to read a CoProducer score, what a 70-to-90 repair really changes, and why the report ships as HTML, JSON and TXT.",
        ],
        "essays": [
            "true-peak-is-what-codecs-clip", "reencoding-eats-true-peak-headroom", "how-much-headroom-to-leave-for-mastering",
            "turn-the-mix-down-before-you-limit", "when-not-to-reach-for-the-limiter", "clipper-vs-limiter-hip-hop-delivery",
            "sample-rate-and-bit-depth-for-delivery", "gapless-album-gaps-after-mp3-or-aac", "release-checklist-that-matches-the-meter",
            "mastering-bat-vs-opening-the-session", "how-to-read-a-coproducer-score", "what-a-70-to-90-repair-changes",
            "why-three-report-formats",
            "export-stems-for-a-mix-engineer",
            "clean-version-of-a-song-mute-reverse-or-replace",
        ],
    },
    {
        "slug": "low-end-and-mix-dynamics",
        "name": "Low end, 808s & mix dynamics",
        "title": "Low end, 808s & mix dynamics: who owns each frequency",
        "description": "Lacquer essays on 808s and kicks, bus compressor pumping, subsonic rumble, room modes, parallel compression, vocal level, sibilance, reverb mud and mono compatibility.",
        "lede": "Most low-end problems are arguments over a small piece of the spectrum. Decide who owns it, then measure the translation instead of guessing.",
        "intro": [
            "Most low-end problems are arguments over a small piece of the spectrum. A kick and an 808 both want roughly 40–80 Hz. A bus compressor reacting to that energy ducks the hats and vocal air on every note. Rumble under 20–30 Hz that you can barely hear still counts toward the peak your limiter has to catch. And phone speakers play almost nothing below 200–300 Hz, so a clean sub can vanish on the speaker most people actually use. Even your own chair can lie: room modes make one bass note boom or vanish when you roll back a foot.",
            "These essays decide who owns each frequency, how to keep glue without pumping, and how to check translation with a measurement instead of a guess. The second half moves up the mix: parallel compression that sounds thin because the parallel bus arrives late, vocal level measured as a loudness gap against the beat, sibilance that a master makes louder, reverb returns that fill the low-mids with fog, and stereo width that collapses when the mix folds to mono.",
        ],
        "essays": [
            "808-disappears-on-phone-speakers", "kick-and-808-same-chair", "bus-compressor-pumps-on-the-808",
            "subsonic-rumble-steals-limiter-headroom", "low-end-changes-when-you-move-your-chair", "parallel-compression-sounds-thin-check-latency",
            "how-loud-should-the-vocal-sit", "harsh-esses-get-louder-after-mastering", "reverb-makes-the-mix-muddy-filter-the-return",
            "wide-mixes-fail-in-mono", "phase-correlation-and-mono",
            "delay-time-from-bpm-sync-your-throws",
            "vocal-breaths-turn-them-down-dont-cut-them",
            "pan-law-why-panned-parts-change-level",
            "tune-808-to-the-key-of-your-song",
        ],
    },
    {
        "slug": "432-hz-pitch-and-tempo",
        "name": "432 Hz, pitch & tempo",
        "title": "432 Hz, pitch & tempo: retuning and slowing a finished master",
        "description": "Lacquer essays on 432 Hz retuning: the exact math, resampling vs pitch shift, LUFS and true peak after a retune, alternate masters, history, listening tests and slowed prints.",
        "lede": "A 432 Hz retune is a precise operation with measurable side effects. Start with the math, then the workflow, then the history and the listening tests.",
        "intro": [
            "Retuning a finished master from A=440 to A=432 is a precise operation. Every frequency scales by 432/440 (0.981818, about −31.77 cents), and if the change is made by resampling, the file also gets 1.85% longer. The essays here start with that math and with the three different jobs people mean when they say “pitch it down”: resampling, pitch shifting and tempo change.",
            "Then comes the practical side: what a retune does to LUFS and true peak, how to build a 432 alternate master and batch-retune a folder without touching the approved original, how other reference pitches such as 435 and 442 compare, and a release checklist. The history and rumor pieces check the dated record on concert pitch before A=440 and on the 432 conspiracy claims, and the listening-lab pieces show how to test 432 against 440 blind. Slowed, screwed and halftime prints close the path, because a slower file still needs a legal peak.",
        ],
        "essays": [
            "what-432-hz-actually-changes-in-a-master", "resampling-vs-pitch-shift-vs-tempo", "lufs-and-true-peak-after-432-retune",
            "how-to-make-a-432-hz-alternate-master", "batch-retune-a-folder-to-432-hz-safely", "432-hz-release-checklist",
            "432-vs-435-vs-442-hz-reference-pitch-guide", "concert-pitch-history-before-a440", "432-hz-conspiracy-theories-fact-check",
            "432-vs-440-blind-listening-test", "songs-that-reveal-a-432-hz-retune", "screw-tempo-still-needs-a-legal-peak",
            "halftime-still-needs-a-legal-peak", "when-to-slow-the-bounce",
        ],
    },
    {
        "slug": "stems-sampling-and-privacy",
        "name": "Stem separation, sampling & privacy",
        "title": "Stem separation, sampling & privacy for unreleased music",
        "description": "Lacquer essays on stem separation: Demucs vs MDX-Net, splitting from the cleanest copy, sampling around bleed, cloud splitter terms and local processing.",
        "lede": "Stems are a diagnostic tool and a sampling source. Both raise the same questions: how clean is the split, and where did the audio go to get split?",
        "intro": [
            "Stem separation is a diagnostic tool and, more and more, a sampling source. Both uses raise the same two questions: how clean is the split, and where did the audio have to go to get split? These essays compare Demucs and MDX-Net using the published benchmarks and a runnable listening window, explain why the copy you feed a separator sets the quality ceiling, and give a sampling workflow that chops around bleed instead of through it.",
            "The privacy half is about unreleased music: the four terms-of-service clauses to read before uploading to a cloud splitter, what browser-local and offline processing actually protect (and the metadata that leaks anyway), and when local tools beat an upload queue. The thread through all of it: use stems to hear the problem, fix the mix itself, and keep unreleased files on your own machine when you can.",
        ],
        "essays": [
            "stems-diagnose-mixes-do-not-replace-them", "demucs-vs-mdx-net-stem-separation-compared", "split-stems-from-youtube-audio-you-own",
            "sampling-from-separated-stems-workflow", "cloud-stem-splitter-privacy-unreleased-music", "local-audio-processing-for-unreleased-masters",
            "should-you-upload-an-unreleased-master", "local-tools-beat-upload-queues",
            "clicks-at-edit-points-fade-every-cut",
        ],
    },
]

E = html.escape


def dump(o) -> str:
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def meta(slug: str) -> dict:
    s = BeautifulSoup((BLOG / f"{slug}.html").read_text(encoding="utf-8"), "html.parser")
    art = s.find("article", class_="post")
    h1 = art.find("h1").get_text(" ", strip=True)
    kicker = art.find(class_="kicker")
    desc = s.find("meta", attrs={"name": "description"})["content"]
    hero = art.select_one(".post-hero img")
    return {
        "slug": slug,
        "title": h1,
        "kicker": kicker.get_text(" ", strip=True) if kicker else "",
        "desc": desc,
        "thumb": f"../img/essays/w/{Path(hero['src'].split('?')[0]).stem}-480.webp" if hero else "",
        "alt": hero.get("alt", "") if hero else "",
    }


HUB_CSS = """
.hub { width: min(1100px, calc(100% - 40px)); margin: 0 auto; padding: 56px 0 72px; }
.hub .kicker { margin: 0 0 14px; }
.hub h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500; font-size: clamp(36px, 6vw, 64px); line-height: 1.02; margin: 0 0 18px; color: var(--ivory); }
.hub .lede { font-size: 19px; max-width: 760px; color: var(--ivory); }
.hub .intro p { max-width: 760px; color: var(--ink); line-height: 1.7; }
.hub-path { list-style: none; padding: 0; margin: 40px 0 0; display: grid; gap: 1px; background: var(--hair, rgba(196,165,116,.18)); border: 1px solid var(--hair, rgba(196,165,116,.18)); counter-reset: hub; }
.hub-path li { background: var(--lacquer); counter-increment: hub; }
.hub-path a { display: grid; grid-template-columns: 180px 1fr; gap: 22px; padding: 18px; text-decoration: none; color: inherit; align-items: center; }
.hub-path a:hover h2 { color: var(--magenta); }
.hub-path img { width: 180px; height: 101px; object-fit: cover; }
.hub-path .n::before { content: counter(hub, decimal-leading-zero) " · "; color: var(--magenta); }
.hub-path .n { font: 500 11px "JetBrains Mono", monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
.hub-path h2 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500; font-size: 24px; line-height: 1.15; margin: 6px 0 6px; color: var(--ivory); }
.hub-path p { margin: 0; color: var(--ink); font-size: 15px; }
.hub-others { margin-top: 44px; font: 500 12px "JetBrains Mono", monospace; letter-spacing: .06em; }
.hub-others a { color: var(--ivory); margin-right: 14px; }
@media (max-width: 640px) { .hub-path a { grid-template-columns: 1fr; } .hub-path img { width: 100%; height: auto; aspect-ratio: 16/9; } }
"""

FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500;1,600&amp;family=Figtree:wght@400;500&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap"


def hub_page(t: dict, items: list[dict]) -> str:
    url = f"{BASE}/blog/topics/{t['slug']}.html"
    og = f"{BASE}/blog/img/brand/lacquer-og.jpg"
    coll = {
        "@context": "https://schema.org", "@type": "CollectionPage", "@id": url + "#collection", "url": url,
        "name": t["title"], "description": t["description"], "inLanguage": "en-US",
        "isPartOf": {"@id": f"{BASE}/#website"}, "publisher": {"@id": f"{BASE}/#organization"},
        "about": t["name"],
        "mainEntity": {"@type": "ItemList", "numberOfItems": len(items), "itemListOrder": "https://schema.org/ItemListOrderAscending",
                        "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{BASE}/blog/{m['slug']}.html", "name": m["title"]} for i, m in enumerate(items)]},
    }
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "CoProducer", "item": f"{BASE}/"},
        {"@type": "ListItem", "position": 2, "name": "Lacquer Journal", "item": f"{BASE}/blog/index.html"},
        {"@type": "ListItem", "position": 3, "name": t["name"], "item": url}]}
    lis = []
    for m in items:
        img = (f'<img src="{m["thumb"]}" alt="{E(m["alt"])}" width="480" height="270" loading="lazy" decoding="async"/>' if m["thumb"] else "")
        lis.append(f'<li><a href="../{m["slug"]}.html">{img}<div><span class="n">{E(m["kicker"])}</span><h2>{E(m["title"])}</h2><p>{E(m["desc"])}</p></div></a></li>')
    others = " ".join(f'<a href="{o["slug"]}.html">{E(o["name"])}</a>' for o in TOPICS if o["slug"] != t["slug"])
    intro = "\n".join(f"<p>{E(p)}</p>" for p in t["intro"])
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{E(t['title'])} | Lacquer</title>
<meta name="description" content="{E(t['description'])}"/>
<link rel="canonical" href="{url}"/>
<meta name="robots" content="index,follow,max-image-preview:large"/>
<meta name="author" content="NoDAW Labs"/>
<meta name="theme-color" content="#050308"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="CoProducer"/>
<meta property="og:locale" content="en_US"/>
<meta property="og:title" content="{E(t['title'])}"/>
<meta property="og:description" content="{E(t['description'])}"/>
<meta property="og:url" content="{url}"/>
<meta property="og:image" content="{og}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="{E(t['title'])}"/>
<meta name="twitter:description" content="{E(t['description'])}"/>
<meta name="twitter:image" content="{og}"/>
<link rel="alternate" type="application/rss+xml" title="Lacquer — CoProducer Journal" href="{BASE}/blog/rss.xml"/>
<link rel="icon" href="../../favicon.ico" sizes="48x48"/>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg"/>
<link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png"/>
<link rel="manifest" href="../../site.webmanifest"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="{FONTS}" rel="stylesheet" media="print" onload="this.media='all'"/><noscript><link href="{FONTS}" rel="stylesheet"/></noscript>
<link href="../css/journal.css" rel="stylesheet"/>
<style>{HUB_CSS}</style>
<script type="application/ld+json">{dump(coll)}</script><script type="application/ld+json">{dump(crumbs)}</script>
</head>
<body>
<header class="top">
<a class="mark" href="../../index.html"><em>Co</em>Producer</a>
<nav aria-label="Primary" class="nav">
<a href="../index.html">Journal</a>
<a href="../../index.html#ab">A/B</a>
<a href="../../index.html#analyzeHome">Analyze</a>
<a href="../../guides/index.html">Guides</a>
<a href="../../pricing.html">Pricing</a>
</nav>
<a class="cta" href="../../index.html#analyzeHome">Measure a mix</a>
</header>
<main class="hub" id="main">
<p class="kicker"><a href="../index.html">Lacquer</a> · Topic · {len(items)} essays</p>
<h1>{E(t['name'])}</h1>
<p class="lede">{E(t['lede'])}</p>
<div class="intro">
{intro}
</div>
<ol class="hub-path" aria-label="Reading path">
{chr(10).join(lis)}
</ol>
<p class="hub-others">More topics: {others} <a href="../index.html">All essays</a></p>
</main>
<footer class="site"><span>Lacquer · CoProducer Journal</span><span><a href="../index.html">All essays</a> · <a href="../rss.xml">RSS</a></span></footer>
</body>
</html>
"""


def keep_reading(slug: str, topic: dict, titles: dict[str, str]) -> str:
    order = topic["essays"]
    i = order.index(slug)
    n = len(order)
    ring = [order[(i + k) % n] for k in (1, 2, 3)]
    page = (BLOG / f"{slug}.html").read_text(encoding="utf-8")
    m = re.search(r'<nav[^>]*class="related-essays[^"]*"[^>]*>.*?</nav>', page, re.S)
    existing = []
    if m:
        for h in re.findall(r'<li><a href="([a-z0-9-]+)\.html"', m.group(0)):
            if h != slug and h not in existing and h in titles:
                existing.append(h)
    links = []
    for h in existing + ring:
        if h not in links and h != slug:
            links.append(h)
    lis = "".join(f'<li><a href="{h}.html">{E(titles[h])}</a></li>' for h in links)
    return (f'<nav aria-label="Keep reading" class="related-essays keep-reading" style="margin:48px 0 24px;padding-top:24px;border-top:1px solid rgba(196,165,116,.32)">'
            f'<h2>Keep reading</h2><ul>{lis}</ul>'
            f'<p class="hub-link">More in <a href="topics/{topic["slug"]}.html">{E(topic["name"])}</a> · <a href="index.html">All essays</a></p></nav>')


def main() -> None:
    titles = {}
    metas = {}
    for t in TOPICS:
        for slug in t["essays"]:
            metas[slug] = meta(slug)
            titles[slug] = metas[slug]["title"]
    (BLOG / "topics").mkdir(exist_ok=True)
    for t in TOPICS:
        (BLOG / "topics" / f"{t['slug']}.html").write_text(hub_page(t, [metas[s] for s in t["essays"]]), encoding="utf-8")
    # Keep reading blocks
    for t in TOPICS:
        for slug in t["essays"]:
            p = BLOG / f"{slug}.html"
            s = p.read_text(encoding="utf-8")
            block = keep_reading(slug, t, titles)
            s2 = re.sub(r'<nav[^>]*class="related-essays[^"]*"[^>]*>.*?</nav>', lambda _m: block, s, count=1, flags=re.S)
            if s2 == s and "keep-reading" not in s:
                s2 = s.replace("</article>", block + "</article>", 1)
            if s2 != s:
                p.write_text(s2, encoding="utf-8")
    # Topic chips on the blog index
    idx = BLOG / "index.html"
    s = idx.read_text(encoding="utf-8")
    chips = ('<nav aria-label="Topics" class="lq-topics"><span class="lq-topics-label">Topics</span>'
             + "".join(f'<a href="topics/{t["slug"]}.html">{E(t["name"])}</a>' for t in TOPICS) + "</nav>\n")
    s = re.sub(r'<nav aria-label="Topics" class="lq-topics">.*?</nav>\n', "", s, flags=re.S)
    s = s.replace('<section class="folio">', chips + '<section class="folio">', 1)
    idx.write_text(s, encoding="utf-8")
    # Sitemap
    sm = ROOT / "sitemap.xml"
    s = sm.read_text(encoding="utf-8")
    add = ""
    for t in TOPICS:
        loc = f"{BASE}/blog/topics/{t['slug']}.html"
        if f"<loc>{loc}</loc>" in s:
            continue
        add += f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n"
    if add:
        s = s.replace("</urlset>", add + "</urlset>")
        sm.write_text(s, encoding="utf-8")
    print(f"build_hubs: {len(TOPICS)} hubs, {sum(len(t['essays']) for t in TOPICS)} essays")


if __name__ == "__main__":
    main()
