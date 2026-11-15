#!/usr/bin/env python3
"""Submit every URL in sitemap.xml to IndexNow (Bing, Yandex, Seznam, Naver, ...).

The site lives under https://myaiplug.github.io/coproducer-web/, so the key file
cannot sit at the host root. It is published at /coproducer-web/<key>.txt and
passed as keyLocation; IndexNow then accepts URLs under that path.

Usage:
  python3 scripts/indexnow_submit.py            # submit all sitemap URLs
  python3 scripts/indexnow_submit.py --dry-run  # print the payload only
  python3 scripts/indexnow_submit.py URL [URL ...]  # submit specific URLs

Run it after GitHub Pages has deployed (the key file must be live).
Standard library only.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOST = "myaiplug.github.io"
BASE = f"https://{HOST}/coproducer-web"
ENDPOINT = "https://api.indexnow.org/indexnow"
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def find_key() -> str:
    keys = [p.stem for p in ROOT.glob("*.txt")
            if re.fullmatch(r"[0-9a-f]{32}", p.stem)
            and p.read_text(encoding="utf-8").strip() == p.stem]
    if len(keys) != 1:
        sys.exit(f"indexnow: expected exactly one <key>.txt key file in repo root, found {keys}")
    return keys[0]


def sitemap_urls() -> list[str]:
    tree = ET.parse(ROOT / "sitemap.xml")
    urls = [el.text.strip() for el in tree.getroot().findall("sm:url/sm:loc", NS) if el.text]
    return [u for u in dict.fromkeys(urls) if u.startswith(BASE + "/")]


def main(argv: list[str]) -> int:
    dry = "--dry-run" in argv
    explicit = [a for a in argv if not a.startswith("--")]
    key = find_key()
    urls = explicit or sitemap_urls()
    payload = {
        "host": HOST,
        "key": key,
        "keyLocation": f"{BASE}/{key}.txt",
        "urlList": urls[:10000],
    }
    if dry:
        print(json.dumps(payload, indent=2))
        return 0
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status, body = resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        status, body = exc.code, exc.read().decode("utf-8", "replace")
    print(f"indexnow: submitted {len(payload['urlList'])} URLs -> HTTP {status}")
    if body.strip():
        print(body.strip())
    # 200 = accepted, 202 = accepted, key validation pending
    return 0 if status in (200, 202) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
