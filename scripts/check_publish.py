#!/usr/bin/env python3
"""Publish check for the Lacquer journal.

Fails (exit 1) if any blog essay is missing from sitemap.xml, blog/rss.xml,
the blog index cards or ItemList JSON-LD, llms.txt or llms-full.txt (full body text), or if it
lacks a canonical, Open Graph / Twitter tags, or valid Article + BreadcrumbList
JSON-LD (plus FAQPage when the page shows a FAQ).

Usage: python3 scripts/check_publish.py   (needs beautifulsoup4)
"""
from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://myaiplug.github.io/coproducer-web"
BLOG = ROOT / "blog"
# Top-level blog pages that are not essays.
NOT_ESSAYS = {"index.html", "about.html", "methodology.html", "404.html"}
OG = ["og:title", "og:description", "og:image", "og:url", "og:type"]
TW = ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]
ARTICLE_TYPES = {"Article", "BlogPosting", "NewsArticle", "TechArticle", "HowTo"}

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def soup_of(path: Path) -> BeautifulSoup:
    return BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")


def jsonld(soup: BeautifulSoup, where: str) -> list[dict]:
    out: list[dict] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except json.JSONDecodeError as exc:
            err(f"{where}: invalid JSON-LD ({exc})")
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data])
        for it in items:
            if isinstance(it, dict):
                out.append(it)
    return out


def types(obj: dict) -> set[str]:
    t = obj.get("@type", [])
    return set([t] if isinstance(t, str) else t)


def essays() -> list[Path]:
    out = []
    for p in sorted(BLOG.glob("*.html")):
        if p.name in NOT_ESSAYS:
            continue
        if soup_of(p).find("article", class_="post") is None:
            continue
        out.append(p)
    return out


def main() -> int:
    posts = essays()
    if not posts:
        print("No essays found.")
        return 1

    # Sitemap
    try:
        sm = ET.parse(ROOT / "sitemap.xml")
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap = {e.text.strip() for e in sm.findall(".//s:loc", ns) if e.text}
    except ET.ParseError as exc:
        err(f"sitemap.xml: not well-formed ({exc})")
        sitemap = set()
    # RSS
    try:
        rss = ET.parse(BLOG / "rss.xml")
        rss_links = {e.text.strip() for e in rss.findall(".//item/link") if e.text}
    except ET.ParseError as exc:
        err(f"blog/rss.xml: not well-formed ({exc})")
        rss_links = set()
    # Blog index cards + ItemList
    idx = soup_of(BLOG / "index.html")
    cards = {a["href"].split("#")[0] for a in idx.select("main a[href]")}
    itemlist: set[str] = set()
    for obj in jsonld(idx, "blog/index.html"):
        for cand in (obj, obj.get("mainEntity") or {}):
            if isinstance(cand, dict) and "ItemList" in types(cand):
                for li in cand.get("itemListElement", []):
                    if li.get("url"):
                        itemlist.add(li["url"])
    llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
    llms_full = (ROOT / "llms-full.txt").read_text(encoding="utf-8")

    for p in posts:
        name = f"blog/{p.name}"
        url = f"{BASE}/blog/{p.name}"
        s = soup_of(p)
        canon = s.find("link", rel="canonical")
        if not canon or canon.get("href") != url:
            err(f"{name}: canonical missing or not {url}")
        for prop in OG:
            m = s.find("meta", property=prop)
            if not m or not m.get("content", "").strip():
                err(f"{name}: missing {prop}")
        for nm in TW:
            m = s.find("meta", attrs={"name": nm})
            if not m or not m.get("content", "").strip():
                err(f"{name}: missing {nm}")
        objs = jsonld(s, name)
        all_types = set().union(*[types(o) for o in objs]) if objs else set()
        arts = [o for o in objs if types(o) & ARTICLE_TYPES]
        if not arts:
            err(f"{name}: no Article/BlogPosting JSON-LD")
        for a in arts:
            if "Article" in types(a) or "BlogPosting" in types(a):
                for k in ("headline", "datePublished", "image", "mainEntityOfPage", "publisher"):
                    if not a.get(k):
                        err(f"{name}: Article JSON-LD missing {k}")
        if "BreadcrumbList" not in all_types:
            err(f"{name}: no BreadcrumbList JSON-LD")
        if s.find("dl", class_="faq") and "FAQPage" not in all_types:
            err(f"{name}: visible FAQ but no FAQPage JSON-LD")
        if url not in sitemap:
            err(f"{name}: not in sitemap.xml")
        if url not in rss_links:
            err(f"{name}: not in blog/rss.xml")
        if p.name not in cards:
            err(f"{name}: no card on blog/index.html")
        if url not in itemlist:
            err(f"{name}: not in blog/index.html ItemList")
        if url not in llms:
            err(f"{name}: not in llms.txt")
        if url not in llms_full:
            err(f"{name}: not in llms-full.txt")
        ans = s.find(class_="answer")
        if ans:
            snippet = " ".join(ans.get_text().split())[:80]
            if snippet and snippet not in " ".join(llms_full.split()):
                err(f"{name}: llms-full.txt lacks the essay body (answer paragraph not found)")

    for hub in sorted((BLOG / "topics").glob("*.html")):
        hub_url = f"{BASE}/blog/topics/{hub.name}"
        if hub_url not in sitemap:
            err(f"blog/topics/{hub.name}: topic hub not in sitemap.xml")
        hs = soup_of(hub)
        canon = hs.find("link", rel="canonical")
        if not canon or canon.get("href") != hub_url:
            err(f"blog/topics/{hub.name}: canonical missing or wrong")
        htypes = set().union(*[types(o) for o in jsonld(hs, hub.name)] or [set()])
        if not {"CollectionPage", "BreadcrumbList"} <= htypes:
            err(f"blog/topics/{hub.name}: needs CollectionPage + BreadcrumbList JSON-LD")

    # Advisory only: essays with fewer than 3 inbound links from other essays.
    inbound: dict[str, set[str]] = {p.name: set() for p in posts}
    for p in posts:
        art = soup_of(p).find("article", class_="post")
        for a in art.find_all("a", href=True):
            h = a["href"].split("#")[0]
            if h in inbound and h != p.name:
                inbound[h].add(p.name)
    weak = sorted(n for n, src in inbound.items() if len(src) < 3)
    if weak:
        print(f"check_publish: note — {len(weak)} essay(s) have < 3 inbound essay links: {', '.join(weak)}")

    for mirror in (".well-known/llms.txt", "well-known/llms.txt"):
        mp = ROOT / mirror
        if not mp.exists() or mp.read_text(encoding="utf-8") != llms:
            err(f"{mirror}: missing or out of sync with llms.txt (run scripts/build_llms_full.py)")

    if errors:
        print(f"check_publish: {len(errors)} problem(s) across {len(posts)} essays")
        for e in errors:
            print("  -", e)
        return 1
    print(f"check_publish: OK — {len(posts)} essays complete in sitemap, RSS, index, ItemList, llms.txt, llms-full.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
