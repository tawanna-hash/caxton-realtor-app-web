#!/usr/bin/env python3
# phase6d-patch.py
#
# Option C: make PDF-annotation link clicks fire the same tracking beacon that
# HotspotLayer uses, so designer-embedded InDesign links count toward advertiser
# performance reports.
#
# Two edits to components/InteractiveMagazineReader.tsx:
#   1. Insert tracking + URL-match helpers after the imports.
#   2. In the PageCanvas overlay <a> onClick, match the overlay URL to a hotspot
#      (the `hotspots` prop is already filtered to this page) and fire
#      trackHotspotClick(hotspot.id) alongside the existing PostHog event.
#
# Idempotent: re-running detects the marker and skips. Refuses to write if an
# anchor isn't found exactly once.
#
# Run from repo root:  python3 phase6d-patch.py

import sys, os, shutil

TARGET = "components/InteractiveMagazineReader.tsx"

HELPERS = '''
// ---- Phase 6 (Option C): PDF-annotation link click tracking ----
// PDF link annotations render as overlay <a> tags in PageCanvas. Those are a
// separate click surface from HotspotLayer and were never tracked, so clicks on
// designer-embedded InDesign links never reached magazine_hotspot_clicks. We
// match each overlay link to its page's hotspot by normalized URL and fire the
// same beacon HotspotLayer uses.
const MZ_SESSION_COOKIE = 'mz_session';
const MZ_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function mzGetOrCreateSessionId(): string {
  if (typeof document === 'undefined') return '';
  const existing = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${MZ_SESSION_COOKIE}=`));
  if (existing) return existing.split('=')[1];
  const id = 'sx_' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
  document.cookie = `${MZ_SESSION_COOKIE}=${id}; path=/; max-age=${MZ_SESSION_MAX_AGE}; samesite=lax`;
  return id;
}

function trackHotspotClick(hotspotId: number): void {
  const sessionId = mzGetOrCreateSessionId();
  if (!sessionId) return;
  const payload = JSON.stringify({ session_id: sessionId });
  const url = `/api/hotspots/${hotspotId}/click`;
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    } catch {
      /* fall through to fetch */
    }
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => { /* noop */ });
}

// Normalize for loose matching: lowercase, drop protocol, leading www., and
// trailing slash. Keeps path + query so UTM-tagged links stay distinct.
function mzNormalizeUrl(u: string): string {
  return (u || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\\/\\//, '')
    .replace(/^www\\./, '')
    .replace(/\\/+$/, '');
}

// Match a PDF overlay URL to a hotspot (already filtered to this page).
// Tries config.url then config.tracking_url for link hotspots, and url for mls.
function matchHotspotByUrl(
  overlayUrl: string,
  pageHotspots: PublicHotspot[],
): PublicHotspot | null {
  const target = mzNormalizeUrl(overlayUrl);
  if (!target) return null;
  for (const h of pageHotspots) {
    if (h.config.type === 'link') {
      if (mzNormalizeUrl(h.config.url) === target) return h;
      if (h.config.tracking_url && mzNormalizeUrl(h.config.tracking_url) === target) return h;
    } else if (h.config.type === 'mls') {
      if (mzNormalizeUrl(h.config.url) === target) return h;
    }
  }
  return null;
}
// ---- end Phase 6 (Option C) helpers ----
'''

IMPORT_ANCHOR = "import type { PublicHotspot } from '@/lib/hotspots';"

ONCLICK_OLD = """          onClick={() =>
            trackEvent('flipbook_link_clicked', {
              ...trackContext,
              page: pageNum + 1,
              url: o.url,
              reader: 'interactive_v4',
            })
          }"""

ONCLICK_NEW = """          onClick={() => {
            trackEvent('flipbook_link_clicked', {
              ...trackContext,
              page: pageNum + 1,
              url: o.url,
              reader: 'interactive_v4',
            });
            const matched = matchHotspotByUrl(o.url, hotspots);
            if (matched) trackHotspotClick(matched.id);
          }}"""

MARKER = "Phase 6 (Option C): PDF-annotation link click tracking"


def fail(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def main():
    if not os.path.isfile(TARGET):
        fail(f"{TARGET} not found. Run from the repo root.")

    with open(TARGET, "r", encoding="utf-8") as f:
        src = f.read()

    if MARKER in src:
        print("  [skip] Helpers already present — nothing to do.")
        # Still verify the onClick was patched; if not, that's a problem.
        if "matchHotspotByUrl(o.url, hotspots)" not in src:
            fail("Marker present but onClick patch missing. Manual review needed.")
        print("  [ok]   onClick patch already present too. Fully patched.")
        return

    # Verify anchors exist exactly once.
    if src.count(IMPORT_ANCHOR) != 1:
        fail(f"Import anchor found {src.count(IMPORT_ANCHOR)} times (expected 1).")
    if src.count(ONCLICK_OLD) != 1:
        fail(f"onClick block found {src.count(ONCLICK_OLD)} times (expected 1). "
             "The file may differ from what we inspected — paste lines 1280-1300.")

    # Backup
    backup = TARGET + ".bak.phase6d"
    if not os.path.isfile(backup):
        shutil.copy2(TARGET, backup)
        print(f"  Backup -> {backup}")

    # Edit 1: insert helpers right after the import anchor line.
    src = src.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + "\n" + HELPERS, 1)
    print("  [ok]   Edit 1 — inserted tracking + URL-match helpers")

    # Edit 2: swap the onClick block.
    src = src.replace(ONCLICK_OLD, ONCLICK_NEW, 1)
    print("  [ok]   Edit 2 — overlay onClick now fires trackHotspotClick on URL match")

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(src)

    print("\nDone. Verify with:")
    print("  grep -n 'matchHotspotByUrl\\|trackHotspotClick' " + f'"{TARGET}"')


if __name__ == "__main__":
    main()
