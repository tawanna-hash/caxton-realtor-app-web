#!/usr/bin/env python3
"""
patch-dashboard-v4.py — Rename the "About" detail-page section to "Description"
to match how UnlockMLS labels the same content. Idempotent.
"""

from __future__ import annotations
import sys
from pathlib import Path

REPO_ROOT = Path.cwd()
TARGET = REPO_ROOT / "app" / "(dashboard)" / "dashboard" / "page.tsx"

OLD = '          <DetailSection label="About">'
NEW = '          <DetailSection label="Description">'


def main() -> int:
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found.", file=sys.stderr)
        return 1
    text = TARGET.read_text(encoding="utf-8")
    if NEW in text:
        print("Description label: already patched.")
        return 0
    if OLD not in text:
        print("WARNING: 'About' label not found in expected form.", file=sys.stderr)
        return 2
    text = text.replace(OLD, NEW)
    TARGET.write_text(text, encoding="utf-8")
    print("Description label: patched.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
