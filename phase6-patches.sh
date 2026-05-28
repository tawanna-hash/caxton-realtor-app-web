#!/bin/bash
# phase6-patches.sh
#
# Phase 6 in-place patches for files we don't replace wholesale.
# Idempotent — re-running won't double-apply.
# Run from the repo root: bash phase6-patches.sh
#
# Patches applied:
#   1. HotspotsAdminClient.tsx — newHotspot init gets `advertiser_id: null`
#   2. HotspotsAdminClient.tsx — updateHotspot passes advertiser_id through to apiBody
#   3. HotspotsAdminClient.tsx — modal call site passes defaultPublication
#
# Route files (hotspots POST + hotspots PATCH) are replaced wholesale via the
# tarball — they need full-file context to patch safely.

set -e

TARGET="app/admin/magazines/[id]/hotspots/HotspotsAdminClient.tsx"

if [ ! -f "$TARGET" ]; then
  echo "ERROR: $TARGET not found. Run this from the repo root."
  exit 1
fi

# Make a backup once
if [ ! -f "$TARGET.bak.phase6" ]; then
  cp "$TARGET" "$TARGET.bak.phase6"
  echo "Backup → $TARGET.bak.phase6"
fi

# ---- Patch 1: add advertiser_id: null to newHotspot initializer ----
# Hook: line with `is_published: false,` (only one occurrence in this file —
# the newHotspot create payload).
if grep -q "advertiser_id: null," "$TARGET"; then
  echo "  [skip] patch 1 — advertiser_id: null already present"
else
  perl -i -pe 's|^(\s*)is_published: false,$|$1is_published: false,\n$1advertiser_id: null,|' "$TARGET"
  echo "  [ok]   patch 1 — added advertiser_id: null to newHotspot"
fi

# ---- Patch 2: pass updates.advertiser_id through to apiBody in updateHotspot ----
# Hook: the existing is_published passthrough line. We insert advertiser_id
# right after it.
if grep -q "apiBody.advertiser_id" "$TARGET"; then
  echo "  [skip] patch 2 — apiBody.advertiser_id already present"
else
  perl -i -pe 's|^(\s*)if \(updates\.is_published !== undefined\) apiBody\.is_published = updates\.is_published;$|$1if (updates.is_published !== undefined) apiBody.is_published = updates.is_published;\n$1if (updates.advertiser_id !== undefined) apiBody.advertiser_id = updates.advertiser_id;|' "$TARGET"
  echo "  [ok]   patch 2 — added advertiser_id passthrough in updateHotspot"
fi

# ---- Patch 3: pass defaultPublication to the modal ----
# Hook: the `hotspot={editingHotspot}` JSX prop. Insert defaultPublication
# right after.
if grep -q "defaultPublication={magazine.publication}" "$TARGET"; then
  echo "  [skip] patch 3 — defaultPublication already passed"
else
  perl -i -pe 's|^(\s*)hotspot=\{editingHotspot\}$|$1hotspot={editingHotspot}\n$1defaultPublication={magazine.publication}|' "$TARGET"
  echo "  [ok]   patch 3 — added defaultPublication to modal call"
fi

echo ""
echo "Done. Verify changes:"
echo "  grep -n 'advertiser_id\\|defaultPublication' \"$TARGET\""
