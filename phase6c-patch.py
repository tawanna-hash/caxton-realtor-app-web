#!/usr/bin/env python3
# phase6c-patch.py
#
# Wires HotspotPerformance into app/admin/analytics/page.tsx:
#   1. Add the import.
#   2. Render <HotspotPerformance /> just before the "Conversion events for
#      funnel" card (i.e. after Traffic sources).
#
# Idempotent; refuses to write unless each anchor is found exactly once.
# Run from repo root:  python3 phase6c-patch.py

import sys, os, shutil

TARGET = "app/admin/analytics/page.tsx"

IMPORT_ANCHOR = "import KpiStrip from '@/components/KpiStrip';"
IMPORT_ADD = IMPORT_ANCHOR + "\nimport HotspotPerformance from '@/components/HotspotPerformance';"

# Anchor: the opening of the Conversion-events Card. We insert the new section
# right before it. This exact title string is unique in the file.
CONV_ANCHOR = '        {/* Conversion event toggles */}'
CONV_ADD = '''        {/* Phase 6c: hotspot performance — top advertisers + top hotspots (30d).
            Self-contained fetch, independent of the PostHog report. */}
        <HotspotPerformance />

''' + CONV_ANCHOR

MARKER = "import HotspotPerformance from '@/components/HotspotPerformance';"


def fail(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def main():
    if not os.path.isfile(TARGET):
        fail(f"{TARGET} not found. Run from repo root.")

    with open(TARGET, "r", encoding="utf-8") as f:
        src = f.read()

    if MARKER in src:
        print("  [skip] HotspotPerformance already imported.")
        if "<HotspotPerformance />" not in src:
            fail("Import present but <HotspotPerformance /> not rendered. Manual review needed.")
        print("  [ok]   <HotspotPerformance /> already rendered. Fully patched.")
        return

    if src.count(IMPORT_ANCHOR) != 1:
        fail(f"Import anchor (KpiStrip) found {src.count(IMPORT_ANCHOR)} times (expected 1). "
             "Run phase6b first?")
    if src.count(CONV_ANCHOR) != 1:
        fail(f"Conversion-events anchor found {src.count(CONV_ANCHOR)} times (expected 1). "
             "Paste the comment line above the conversion toggles so I can adjust.")

    backup = TARGET + ".bak.phase6c"
    if not os.path.isfile(backup):
        shutil.copy2(TARGET, backup)
        print(f"  Backup -> {backup}")

    src = src.replace(IMPORT_ANCHOR, IMPORT_ADD, 1)
    print("  [ok]   Edit 1 — added HotspotPerformance import")
    src = src.replace(CONV_ANCHOR, CONV_ADD, 1)
    print("  [ok]   Edit 2 — rendered <HotspotPerformance /> before conversion card")

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(src)

    print("\nDone. Verify with:")
    print('  grep -n "HotspotPerformance" ' + f'"{TARGET}"')


if __name__ == "__main__":
    main()
