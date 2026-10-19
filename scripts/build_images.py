#!/usr/bin/env python3
"""Generate resized WebP variants for journal and home images and wire them into
<img> tags (srcset/sizes, width/height, lazy + async below the fold, LCP preload
on essays). Originals are kept: og:image tags still point at the JPGs.
Idempotent: re-run after adding an essay."""
from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = (480, 960, 1600)
QUALITY = 78

ESSAY_HERO_SIZES = "(max-width: 1100px) 100vw, 1100px"
PIECE_SIZES = "(max-width: 900px) 100vw, 60vw"
STACK_SIZES = "(max-width: 900px) 100vw, 40vw"
HOME_SIZES = "(max-width: 900px) 100vw, 50vw"


def variants(src: Path) -> list[tuple[Path, int]]:
    """Create (if needed) WebP variants next to src in a w/ folder."""
    out = []
    with Image.open(src) as im:
        w0, h0 = im.size
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        for w in WIDTHS:
            w = min(w, w0)
            dst = src.parent / "w" / f"{src.stem}-{w}.webp"
            if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
                dst.parent.mkdir(exist_ok=True)
                h = round(h0 * w / w0)
                im.resize((w, h), Image.LANCZOS).save(dst, "WEBP", quality=QUALITY, method=6)
            out.append((dst, w))
            if w == w0:
                break
    return out


def size_of(src: Path) -> tuple[int, int]:
    with Image.open(src) as im:
        return im.size


ATTR = re.compile(r'([\w:-]+)(?:="([^"]*)")?')


def parse(tag: str) -> dict[str, str | None]:
    inner = tag[4:].rstrip("/>").rstrip("/").strip()
    return {m.group(1): m.group(2) for m in ATTR.finditer(inner)}


def build(attrs: dict[str, str | None]) -> str:
    parts = []
    for k, v in attrs.items():
        parts.append(k if v is None else f'{k}="{v}"')
    return "<img " + " ".join(parts) + "/>"


def rewrite_img(tag: str, page: Path, *, sizes: str, eager: bool, high: bool = False) -> tuple[str, str | None]:
    a = parse(tag)
    src = a.get("src") or ""
    if not src or src.startswith(("http:", "https:", "data:")) or "srcset" in a:
        return tag, None
    path_part = html.unescape(src.split("?")[0])
    file = (page.parent / path_part).resolve()
    if not file.exists() or file.suffix.lower() not in (".jpg", ".jpeg", ".png"):
        return tag, None
    vs = variants(file)
    base_rel = path_part.rsplit("/", 1)[0] + "/w/" if "/" in path_part else "w/"
    srcset = ", ".join(f"{base_rel}{d.name} {w}w" for d, w in vs)
    w0, h0 = size_of(file)
    new = {}
    for k, v in a.items():
        new[k] = v
        if k == "src":
            new["srcset"] = srcset
            new["sizes"] = sizes
    new.setdefault("width", str(w0))
    new.setdefault("height", str(h0))
    if eager:
        new.pop("loading", None)
        if high:
            new["fetchpriority"] = "high"
    else:
        new["loading"] = "lazy"
    new["decoding"] = "async"
    return build(new), srcset


def process_essay(page: Path) -> bool:
    s = page.read_text(encoding="utf-8")
    orig = s
    hero_srcset = None

    def hero(m: re.Match) -> str:
        nonlocal hero_srcset
        t, hero_srcset = rewrite_img(m.group(2), page, sizes=ESSAY_HERO_SIZES, eager=True, high=True)
        return m.group(1) + t

    s = re.sub(r'(<div class="post-hero">)(<img [^>]*>)', hero, s, count=1)
    # every other img in the article body is below the fold
    head, sep, body = s.partition('<div class="post-hero">')
    if sep:
        hero_end = body.find("</div>")
        rest = body[hero_end:]
        rest = re.sub(r"<img [^>]*>", lambda m: rewrite_img(m.group(0), page, sizes="(max-width: 900px) 100vw, 760px", eager=False)[0], rest)
        s = head + sep + body[:hero_end] + rest
    if hero_srcset and 'rel="preload" as="image"' not in s:
        pre = f'<link rel="preload" as="image" type="image/webp" fetchpriority="high" imagesrcset="{hero_srcset}" imagesizes="{ESSAY_HERO_SIZES}"/>\n'
        s = s.replace('<link href="css/journal.css" rel="stylesheet"/>', pre + '<link href="css/journal.css" rel="stylesheet"/>', 1)
    if s != orig:
        page.write_text(s, encoding="utf-8")
        return True
    return False


def process_blog_index(page: Path) -> bool:
    s = page.read_text(encoding="utf-8")
    orig = s
    first = [True]

    def card(m: re.Match) -> str:
        cls = m.group(1)
        sizes = PIECE_SIZES if "piece" in cls else STACK_SIZES
        eager = first[0]
        out, _ = rewrite_img(m.group(2), page, sizes=sizes, eager=False)
        first[0] = False
        return m.group(0).replace(m.group(2), out)

    s = re.sub(r'<a (class="piece" )?href="[^"]+">\n(<img [^>]*>)', lambda m: card_wrap(m, page), s)
    if s != orig:
        page.write_text(s, encoding="utf-8")
        return True
    return False


def card_wrap(m: re.Match, page: Path) -> str:
    sizes = PIECE_SIZES if m.group(1) else STACK_SIZES
    out, _ = rewrite_img(m.group(2), page, sizes=sizes, eager=False)
    return m.group(0).replace(m.group(2), out)


def process_home(page: Path) -> bool:
    s = page.read_text(encoding="utf-8")
    orig = s
    seen = [0]

    def img(m: re.Match) -> str:
        tag = m.group(0)
        hero = 'class="hero-art"' in s[max(0, m.start() - 80):m.start()]
        out, _ = rewrite_img(tag, page, sizes=HOME_SIZES, eager=hero, high=hero)
        return out

    s = re.sub(r"<img [^>]*>", img, s)
    if s != orig:
        page.write_text(s, encoding="utf-8")
        return True
    return False


def main() -> None:
    n = 0
    for p in sorted((ROOT / "blog").glob("*.html")):
        if p.name == "index.html":
            continue
        n += process_essay(p)
    n += process_blog_index(ROOT / "blog/index.html")
    n += process_home(ROOT / "index.html")
    print(f"build_images: updated {n} page(s)")


if __name__ == "__main__":
    main()
