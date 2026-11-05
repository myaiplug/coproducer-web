#!/usr/bin/env python3
"""Rewrite the site from https://myaiplug.github.io/coproducer-web to a custom domain.

Prepared for https://coproducer.nodawlabs.com (see funnel/DOMAIN_MOVE.md). Nothing
here runs automatically and nothing here touches DNS or GitHub Pages settings.

  python3 scripts/domain_move.py --dry-run     # list what would change
  python3 scripts/domain_move.py               # apply, rebuild, run check_publish
  python3 scripts/domain_move.py --new-base https://example.org

Why this is more than a find-and-replace: a project page that gets a custom domain
is served from the domain ROOT (https://coproducer.nodawlabs.com/blog/...), not from
/coproducer-web/. So the path segment goes away along with the host.

Only the CoProducer site is rewritten. Links to other repos on the same
github.io account (ScrewAI-App, halfscrew, ...) are left alone.
Re-runnable: a second run finds nothing left to change.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_BASE = "https://myaiplug.github.io/coproducer-web"
OLD_HOST = "myaiplug.github.io"
TEXT_EXT = {".html", ".xml", ".txt", ".json", ".js", ".md", ".py", ".webmanifest", ".yml", ".css", ".svg"}
# Do not rewrite historical planning notes or this script itself.
SKIP_PREFIXES = ("docs/superpowers/", ".git/", "scripts/domain_move.py")


def tracked_files() -> list[Path]:
    out = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
    return [ROOT / p for p in out.splitlines() if p and not p.startswith(SKIP_PREFIXES)]


def rewrite(text: str, new_base: str, new_host: str, rel: str) -> str:
    if rel == "scripts/indexnow_submit.py":
        text = re.sub(r"The site lives under .*?then accepts URLs under that path\.",
                      f"The site lives at {new_base}/. The key file is published at the host\nroot (/<key>.txt) and also passed as keyLocation.", text, flags=re.S)
    # 1. full URLs with the repo path segment
    text = text.replace(OLD_BASE, new_base)
    # 2. scheme-less mentions of the same place (docs, README prose)
    text = text.replace(f"{OLD_HOST}/coproducer-web", new_host)
    # 3. file-specific fixes
    if rel == "site.webmanifest":
        text = text.replace('"/coproducer-web/"', '"/"')
    if rel == "scripts/indexnow_submit.py":
        text = text.replace(f'HOST = "{OLD_HOST}"', f'HOST = "{new_host}"')
        text = text.replace('BASE = f"https://{HOST}/coproducer-web"', 'BASE = f"https://{HOST}"')
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--new-base", default="https://coproducer.nodawlabs.com")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-rebuild", action="store_true")
    a = ap.parse_args()
    new_base = a.new_base.rstrip("/")
    new_host = re.sub(r"^https?://", "", new_base)

    changed, hits = [], 0
    for p in tracked_files():
        if p.suffix.lower() not in TEXT_EXT and p.name not in {"robots.txt", "CNAME"}:
            continue
        try:
            old = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        rel = p.relative_to(ROOT).as_posix()
        new = rewrite(old, new_base, new_host, rel)
        if new != old:
            hits += old.count(OLD_BASE)
            changed.append(rel)
            if not a.dry_run:
                p.write_text(new, encoding="utf-8")
    print(f"domain_move: {len(changed)} files, {hits} absolute URLs rewritten -> {new_base}")
    if a.dry_run:
        for c in changed[:15]:
            print("  ", c)
        print("   ...")
        return 0
    if a.no_rebuild:
        return 0
    # Regenerate everything derived from BASE (checklist page + PDF, llms-full, checks).
    for cmd in (["scripts/build_checklist.py"], ["scripts/build_llms_full.py"], ["scripts/journal_blocks.py", "--check"], ["scripts/check_publish.py"]):
        print("run:", " ".join(cmd))
        r = subprocess.run([sys.executable, *cmd], cwd=ROOT)
        if r.returncode:
            print("FAILED:", cmd)
            return r.returncode
    left = subprocess.run(["git", "grep", "-n", "-I", f"{OLD_HOST}/coproducer-web", "--", ".", ":!docs/superpowers", ":!scripts/domain_move.py"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if left:
        print("WARNING: old URL still present:\n" + left[:2000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
