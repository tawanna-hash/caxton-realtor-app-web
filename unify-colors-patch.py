#!/usr/bin/env python3
# unify-colors-patch.py
#
# Unifies the older public-surface palette to the canonical brand palette
# (the one in lib/publication-theme.ts, from the CRM brand work):
#
#   #1a2a44  (old RealtyLine navy)   -> #021D40  (canonical RealtyLine navy)
#   #2d1a44  (old Newsline purple)   -> #3D0740  (canonical Newsline purple)
#
# Applies a GLOBAL replace across both files (every occurrence, brand-map
# entries AND every UI accent usage). Per the explicit choice to restyle the
# whole dashboard UI to the canonical navy.
#
# Idempotent: if the old hexes are already gone, it reports "nothing to do".
# Makes a .bak.colors backup of each file before writing.
#
# Run from repo root:  python3 unify-colors-patch.py

import sys, os, shutil

FILES = [
    "app/(public)/magazine/MagazineClient.tsx",
    "app/(dashboard)/dashboard/page.tsx",
]

REPLACEMENTS = [
    ("#1a2a44", "#021D40"),
    ("#2d1a44", "#3D0740"),
    # hover variants, in case any exist now or later (no-op if absent)
    ("#243556", "#03285a"),
]


def main():
    any_change = False
    for rel in FILES:
        if not os.path.isfile(rel):
            print(f"  [skip] {rel} not found")
            continue
        with open(rel, "r", encoding="utf-8") as f:
            src = f.read()
        orig = src
        counts = {}
        for old, new in REPLACEMENTS:
            n = src.count(old)
            if n:
                src = src.replace(old, new)
                counts[old] = (n, new)
        if src == orig:
            print(f"  [ok]   {rel} — nothing to do (already canonical)")
            continue
        backup = rel + ".bak.colors"
        if not os.path.isfile(backup):
            shutil.copy2(rel, backup)
        with open(rel, "w", encoding="utf-8") as f:
            f.write(src)
        any_change = True
        summary = ", ".join(f"{old}->{new} ({n}x)" for old, (n, new) in counts.items())
        print(f"  [done] {rel} — {summary}")

    if any_change:
        print("\nVerify no old hexes remain:")
        print('  grep -rn "#1a2a44\\|#2d1a44" "app/(public)/magazine/MagazineClient.tsx" "app/(dashboard)/dashboard/page.tsx"')
    else:
        print("\nNo changes made.")


if __name__ == "__main__":
    main()
