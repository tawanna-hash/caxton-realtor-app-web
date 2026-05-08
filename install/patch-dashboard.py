#!/usr/bin/env python3
"""
patch-dashboard.py — Update the dashboard to fetch events from the new
local API route at /api/events/<publication> instead of the missing external
NEXT_PUBLIC_API_URL backend.

Usage:
    cd path/to/caxton-realtor-app-web
    python3 install/patch-dashboard.py

This script only modifies app/(dashboard)/dashboard/page.tsx and is idempotent.
"""

from __future__ import annotations
import sys
from pathlib import Path

REPO_ROOT = Path.cwd()
TARGET = REPO_ROOT / "app" / "(dashboard)" / "dashboard" / "page.tsx"

# --- Patch 1: switch to local API route -------------------------------------
OLD_FETCH = '    fetch(`${API}/events/${market}`, { credentials: \'include\' })'
NEW_FETCH = '    fetch(`/api/events/${market}`)'

# --- Patch 2: pre-existing TS strict-mode build error in groupByMonth -------
# `new Date(string | null)` isn't allowed under strict TS but the runtime is
# fine. The fallback to '' produces an Invalid Date which the existing
# isNaN(lastDay.getTime()) check already filters out.
OLD_DATE = "    const lastDay = new Date(ev.endDate || ev.startDate);"
NEW_DATE = "    const lastDay = new Date(ev.endDate || ev.startDate || '');"


def main() -> int:
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found. Run this from the repo root.", file=sys.stderr)
        return 1

    text = TARGET.read_text(encoding="utf-8")
    changes = 0
    warnings: list[str] = []

    if NEW_FETCH in text:
        print("Fetch URL: already patched.")
    elif OLD_FETCH in text:
        text = text.replace(OLD_FETCH, NEW_FETCH)
        changes += 1
        print("Fetch URL: patched (now uses /api/events/...)")
    else:
        warnings.append(
            "Could not find the events fetch line. Look for a line like:\n"
            f"  {OLD_FETCH}\n"
            "and change it to:\n"
            f"  {NEW_FETCH}"
        )

    if NEW_DATE in text:
        print("Date fallback: already patched.")
    elif OLD_DATE in text:
        text = text.replace(OLD_DATE, NEW_DATE)
        changes += 1
        print("Date fallback: patched (fixes pre-existing strict-mode TS error)")
    else:
        # Not fatal — only blocks build if the strict TS error was present
        print("Date fallback: not present, skipping.")

    if changes:
        TARGET.write_text(text, encoding="utf-8")
        print(f"\nWrote {changes} change(s) to {TARGET}")
    else:
        print("\nNo changes needed.")

    if warnings:
        print("\nWARNINGS:", file=sys.stderr)
        for w in warnings:
            print(w, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
