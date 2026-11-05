#!/usr/bin/env python3
"""Shared Journal blocks, injected into every essay and the blog index.

  1. Signup block  (every essay + blog index): quiet email field + consent line, posts to the comments API.
  2. Analyzer CTA  (every essay except the 'none' list): "Check your own mix for this", deep-linked to
     analyze.html?check=<focus>&utm_source=journal&utm_medium=essay&utm_campaign=<slug>.
     The header "Check ..." button on an essay gets the same deep link (utm_content=header).

Both are idempotent (comment markers) and run from scripts/build_llms_full.py, which the publish routine already
runs, so tomorrow's essay gets them with no extra step. scripts/check_publish.py fails if either is missing.

  python3 scripts/journal_blocks.py            # inject everywhere (writes only files that change)
  python3 scripts/journal_blocks.py --check    # exit 1 and list problems, write nothing
Mapping data: scripts/analyzer_focus.json.  Focus behaviour on the page: js/analyze-focus.js.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOG = ROOT / "blog"
BASE = "https://myaiplug.github.io/coproducer-web"           # rewritten by the domain-move script
API = "https://coproducer-comments.netlify.app/api/subscribe"
CONSENT = "Send me the free pre-release checklist and the occasional Lacquer note. Unsubscribe any time."  # == CONSENT_TEXT_V1 in the API
MAP = json.loads((Path(__file__).with_name("analyzer_focus.json")).read_text(encoding="utf-8"))
HUB_RE = re.compile(r'href="topics/([a-z0-9-]+)\.html"')
SIGNUP_RE = re.compile(r"<!--lq:signup-->.*?<!--/lq:signup-->", re.S)
CHECK_RE = re.compile(r"<!--lq:check-->.*?<!--/lq:check-->", re.S)
HEADER_CTA_RE = re.compile(r'(<header class="top">.*?<a class="cta" href=")\.\./analyze\.html[^"]*(")', re.S)
UTM = "utm_source=journal&amp;utm_medium=essay&amp;utm_campaign={slug}"


def e(s: str) -> str:
    return html.escape(s, quote=True)


def focus_for(slug: str, text: str) -> str | None:
    if slug in MAP["none"]:
        return None
    if slug in MAP["overrides"]:
        return MAP["overrides"][slug]
    for pat, focus in MAP["keywords"]:
        if re.search(pat, slug):
            return focus
    m = HUB_RE.search(text)
    if m and m.group(1) in MAP["hub_default"]:
        return MAP["hub_default"][m.group(1)]
    return MAP["fallback"]


def deep_link(focus: str, slug: str, content: str | None = None) -> str:
    q = f"check={focus}&amp;" + UTM.format(slug=slug)
    if content:
        q += f"&amp;utm_content={content}"
    return f"../analyze.html?{q}"


def cta_html(slug: str, focus: str) -> str:
    f = MAP["foci"][focus]
    line = MAP["lines"].get(slug, f["line"])
    return (f'<!--lq:check--><aside class="check-cta" aria-label="Check your own mix" data-lq-check="{focus}">'
            f'<p class="check-k">Check your own mix for this</p><p class="check-p">{e(line)}</p>'
            f'<p><a class="check-btn" href="{deep_link(focus, slug, "end")}">{e(f["button"])} →</a></p></aside><!--/lq:check-->')


def signup_html(source: str) -> str:
    ret = f"{BASE}/blog/checklist-thanks.html"
    return (f'<!--lq:signup--><section class="signup" aria-labelledby="signup-h" data-signup="{e(source)}">'
            '<p class="signup-k">A free one-pager</p>'
            '<h2 id="signup-h">The checklist we run before every release.</h2>'
            '<p class="signup-p">Loudness, true peak, mono, tails, export settings and the metadata basics, on one page. '
            'Leave your email and it opens straight away, or '
            '<a href="pre-release-master-checklist.html">read it here first</a>. No email needed for that.</p>'
            f'<form class="signup-form" method="post" action="{API}">'
            '<label class="cmt-sr" for="su-email">Email address</label>'
            '<input id="su-email" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" placeholder="you@studio.com"/>'
            '<div class="cmt-hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"/></label></div>'
            f'<input type="hidden" name="source" value="{e(source)}"/><input type="hidden" name="consent" value="yes"/>'
            f'<input type="hidden" name="return" value="{ret}"/>'
            '<button type="submit">Send me the checklist</button></form>'
            f'<p class="signup-consent">{e(CONSENT)} We never sell your address.</p>'
            '</section><!--/lq:signup-->')


def _put(text: str, rx: re.Pattern, block: str, anchors: list[str]) -> str:
    if rx.search(text):
        return rx.sub(lambda _m: block, text, count=1)
    for a in anchors:
        i = text.find(a)
        if i != -1:
            return text[:i] + block + "\n" + text[i:]
    raise ValueError("no anchor found for " + block[:30])


def render_essay(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    slug = path.stem
    new = _put(text, SIGNUP_RE, signup_html(slug), ['<section class="comments"'])
    focus = focus_for(slug, text)
    if focus:
        new = _put(new, CHECK_RE, cta_html(slug, focus), ['<nav aria-label="Keep reading"', "</article>"])
        new = HEADER_CTA_RE.sub(lambda m: m.group(1) + deep_link(focus, slug, "header") + m.group(2), new, count=1)
    else:
        new = CHECK_RE.sub("", new)
    return new


def render_index(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    return _put(text, SIGNUP_RE, signup_html("blog-index"), ['<section class="comments"'])


def targets() -> list[tuple[Path, str]]:
    sys.path.insert(0, str(Path(__file__).parent))
    from check_publish import essays
    out = [(p, "essay") for p in essays()]
    out.append((BLOG / "index.html", "index"))
    return out


def inject_all(write: bool = True) -> list[str]:
    changed = []
    for p, kind in targets():
        old = p.read_text(encoding="utf-8")
        new = render_essay(p) if kind == "essay" else render_index(p)
        if new != old:
            changed.append(p.name)
            if write:
                p.write_text(new, encoding="utf-8")
    return changed


def problems() -> list[str]:
    """For check_publish: describe anything missing or stale (an out-of-date block counts)."""
    return [f"{n}: journal blocks missing or out of date (run python3 scripts/journal_blocks.py)" for n in inject_all(write=False)]


def main() -> None:
    if "--check" in sys.argv:
        bad = problems()
        print("\n".join(bad) if bad else "journal blocks ok")
        sys.exit(1 if bad else 0)
    ch = inject_all()
    print(f"journal blocks: {len(ch)} file(s) updated" if ch else "journal blocks: already current")


if __name__ == "__main__":
    main()
