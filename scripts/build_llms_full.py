#!/usr/bin/env python3
"""Regenerate llms-full.txt with the full plain-text body of every Lacquer essay,
in blog-index order, plus the product facts from llms.txt. Also mirrors
llms.txt into .well-known/llms.txt and well-known/llms.txt."""
from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://myaiplug.github.io/coproducer-web"
sys.path.insert(0, str(ROOT / "scripts"))
from check_publish import essays  # noqa: E402

SKIP_CLASSES = {"post-hero", "related-essays", "comments"}


def inline(node: Tag) -> str:
    parts = []
    for c in node.descendants:
        if isinstance(c, NavigableString) and not isinstance(c.parent, Tag) or isinstance(c, NavigableString):
            parts.append(str(c))
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def walk(node: Tag, out: list[str]) -> None:
    for el in node.children:
        if not isinstance(el, Tag):
            continue
        cls = set(el.get("class") or [])
        if cls & SKIP_CLASSES or el.name in {"script", "style", "img", "picture", "audio", "video", "figure", "svg", "button"}:
            continue
        if el.has_attr("data-ab") or el.has_attr("data-comments"):
            continue
        if el.name == "header":
            continue
        if el.name in {"h2", "h3", "h4"}:
            out.append("\n" + "#" * (int(el.name[1]) + 1) + " " + inline(el))
        elif el.name in {"p", "blockquote"}:
            t = inline(el)
            if t:
                out.append(t)
        elif el.name in {"ul", "ol"}:
            for k, li in enumerate(el.find_all("li", recursive=False), 1):
                out.append(("- " if el.name == "ul" else f"{k}. ") + inline(li))
        elif el.name == "dl":
            for dt in el.find_all("dt"):
                dd = dt.find_next_sibling("dd")
                out.append(f"Q: {inline(dt)}\nA: {inline(dd) if dd else ''}")
        elif el.name == "table":
            for tr in el.find_all("tr"):
                out.append(" | ".join(inline(c) for c in tr.find_all(["th", "td"])))
        elif el.name == "aside":
            t = inline(el)
            if t:
                out.append(f"Note: {t}")
        elif el.name == "pre":
            out.append(el.get_text())
        else:
            walk(el, out)


def essay_text(path: Path) -> tuple[str, str]:
    s = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    art = s.find("article", class_="post")
    h1 = art.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else s.title.get_text(strip=True)
    kicker = art.find(class_="kicker")
    desc = s.find("meta", attrs={"name": "description"})
    out = [f"## {title}", f"URL: {BASE}/blog/{path.name}"]
    if kicker:
        out.append(f"Section: {kicker.get_text(' ', strip=True)}")
    if desc:
        out.append(f"Summary: {desc['content']}")
    out.append("")
    walk(art, out)
    return title, "\n".join(out).strip() + "\n"


def order() -> list[Path]:
    idx = BeautifulSoup((ROOT / "blog/index.html").read_text(encoding="utf-8"), "html.parser")
    seen: list[str] = []
    for a in idx.select("section.folio a[href]"):
        h = a["href"]
        if h.endswith(".html") and h not in seen:
            seen.append(h)
    posts = {p.name: p for p in essays()}
    ordered = [posts[h] for h in seen if h in posts]
    ordered += [p for n, p in posts.items() if n not in seen]
    return ordered


def section(md: str, head: str) -> str:
    m = re.search(rf"^## {re.escape(head)}.*?(?=^## |\Z)", md, re.S | re.M)
    return m.group(0).strip() + "\n\n" if m else ""


def main() -> None:
    llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
    posts = order()
    head = [
        "# CoProducer and Lacquer — full text for assistants",
        f"Base: {BASE}/",
        f"Updated: {date.today().isoformat()}",
        f"Essays: {len(posts)} (full plain-text bodies, in journal order)",
        "Summary index: " + f"{BASE}/llms.txt",
        "",
    ]
    body = "\n".join(head) + "\n"
    body += section(llms, "Identity") + section(llms, "Cite these facts") + section(llms, "Hard constraints")
    body += "# Lacquer essays\n\n"
    body += "\n---\n\n".join(essay_text(p)[1] for p in posts)
    (ROOT / "llms-full.txt").write_text(body, encoding="utf-8")
    for d in (".well-known", "well-known"):
        (ROOT / d).mkdir(exist_ok=True)
        (ROOT / d / "llms.txt").write_text(llms, encoding="utf-8")
    print(f"llms-full.txt: {len(posts)} essays, {len(body.split())} words, {len(body.encode())//1024} KB")


if __name__ == "__main__":
    main()
