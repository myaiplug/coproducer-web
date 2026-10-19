#!/usr/bin/env python3
"""Idempotently add the RSS alternate link, favicon set and web manifest to
every HTML page head. Safe to re-run after adding pages."""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://myaiplug.github.io/coproducer-web"
SKIP_DIRS = {".git", "node_modules", "demo", "docs", "tools"}
NO_ICONS = {"halfscrew/index.html"}  # separate HalfScrew app brand


def rel(page: Path, target: str) -> str:
    return os.path.relpath(ROOT / target, page.parent).replace(os.sep, "/")


def block(page: Path, icons: bool) -> str:
    out = [f'<link rel="alternate" type="application/rss+xml" title="Lacquer — CoProducer Journal" href="{BASE}/blog/rss.xml"/>']
    if icons:
        out += [
            f'<link rel="icon" href="{rel(page, "favicon.ico")}" sizes="48x48"/>',
            f'<link rel="icon" type="image/svg+xml" href="{rel(page, "assets/favicon.svg")}"/>',
            f'<link rel="apple-touch-icon" href="{rel(page, "assets/apple-touch-icon.png")}"/>',
            f'<link rel="manifest" href="{rel(page, "site.webmanifest")}"/>',
        ]
    return "\n".join(out) + "\n"


def main() -> None:
    changed = 0
    for page in sorted(ROOT.rglob("*.html")):
        r = page.relative_to(ROOT).as_posix()
        if set(page.relative_to(ROOT).parts[:-1]) & SKIP_DIRS:
            continue
        s = page.read_text(encoding="utf-8")
        if "</head>" not in s or 'type="application/rss+xml"' in s:
            continue
        icons = r not in NO_ICONS and 'rel="icon"' not in s
        add = block(page, icons)
        m = re.search(r'<link[^>]*rel="canonical"[^>]*>\n?', s) or re.search(r"<title>.*?</title>\n?", s, re.S)
        if m:
            end = m.end()
            if not s[m.end() - 1] == "\n":
                add = "\n" + add
            s = s[:end] + add + s[end:]
        else:
            s = s.replace("</head>", add + "</head>", 1)
        page.write_text(s, encoding="utf-8")
        changed += 1
    print(f"head_links: updated {changed} page(s)")


if __name__ == "__main__":
    main()
