#!/usr/bin/env python3
# phase6b-patch.py
#
# Wires the KpiStrip into app/admin/analytics/page.tsx:
#   1. Add the import.
#   2. Render <KpiStrip /> as the first child of <main>, above the freshness banner.
#
# Idempotent; refuses to write if an anchor isn't found exactly once.
# Run from repo root:  python3 phase6b-patch.py

import sys, os, shutil

TARGET = "app/admin/analytics/page.tsx"

IMPORT_ANCHOR = "import { useCallback, useEffect, useState } from 'react';"
IMPORT_ADD = IMPORT_ANCHOR + "\nimport KpiStrip from '@/components/KpiStrip';"

# The opening of <main>. We insert the strip + a heading right after it.
MAIN_ANCHOR = '      <main className="space-y-5 min-w-0">'
MAIN_ADD = MAIN_ANCHOR + '''

        {/* Phase 6b: cross-system at-a-glance KPIs. Self-contained fetch —
            renders instantly, independent of the slow PostHog report below. */}
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">At a glance</h2>
          <KpiStrip />
        </div>'''

MARKER = "import KpiStrip from '@/components/KpiStrip';"


def fail(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def main():
    if not os.path.isfile(TARGET):
        fail(f"{TARGET} not found. Run from repo root.")

    with open(TARGET, "r", encoding="utf-8") as f:
        src = f.read()

    if MARKER in src:
        print("  [skip] KpiStrip already imported.")
        if "<KpiStrip />" not in src:
            fail("Import present but <KpiStrip /> not rendered. Manual review needed.")
        print("  [ok]   <KpiStrip /> already rendered. Fully patched.")
        return

    if src.count(IMPORT_ANCHOR) != 1:
        fail(f"Import anchor found {src.count(IMPORT_ANCHOR)} times (expected 1).")
    if src.count(MAIN_ANCHOR) != 1:
        fail(f"<main> anchor found {src.count(MAIN_ANCHOR)} times (expected 1). "
             "Paste the line with '<main className' so I can adjust.")

    backup = TARGET + ".bak.phase6b"
    if not os.path.isfile(backup):
        shutil.copy2(TARGET, backup)
        print(f"  Backup -> {backup}")

    src = src.replace(IMPORT_ANCHOR, IMPORT_ADD, 1)
    print("  [ok]   Edit 1 — added KpiStrip import")
    src = src.replace(MAIN_ANCHOR, MAIN_ADD, 1)
    print("  [ok]   Edit 2 — rendered <KpiStrip /> at top of <main>")

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(src)

    print("\nDone. Verify with:")
    print('  grep -n "KpiStrip" ' + f'"{TARGET}"')


if __name__ == "__main__":
    main()
