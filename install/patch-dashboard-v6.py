#!/usr/bin/env python3
"""
patch-dashboard-v6.py — Move the Description section above the Date section
in the event detail page. Idempotent.
"""

from __future__ import annotations
import sys
from pathlib import Path

REPO_ROOT = Path.cwd()
TARGET = REPO_ROOT / "app" / "(dashboard)" / "dashboard" / "page.tsx"

DESC_BLOCK = """        {/* DESCRIPTION section */}
        {description && description.length > 0 && (
          <DetailSection label="Description">
            <p className="text-base text-gray-700 leading-relaxed font-light whitespace-pre-wrap">{description}</p>
          </DetailSection>
        )}

"""

DATE_ANCHOR = "        {/* DATE section */}"


def main() -> int:
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found.", file=sys.stderr)
        return 1
    text = TARGET.read_text(encoding="utf-8")

    # Find where Description currently sits.
    desc_idx = text.find(DESC_BLOCK)
    date_idx = text.find(DATE_ANCHOR)

    if desc_idx < 0 or date_idx < 0:
        print("WARNING: could not find Description or Date block in expected form.", file=sys.stderr)
        return 2

    if desc_idx < date_idx:
        print("Description is already above Date. No changes.")
        return 0

    # Remove the existing Description block, then insert it right before Date.
    without_desc = text[:desc_idx] + text[desc_idx + len(DESC_BLOCK):]
    date_idx_new = without_desc.find(DATE_ANCHOR)
    new_text = without_desc[:date_idx_new] + DESC_BLOCK + without_desc[date_idx_new:]

    TARGET.write_text(new_text, encoding="utf-8")
    print("Description moved above Date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
