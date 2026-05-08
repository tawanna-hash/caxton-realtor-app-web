#!/usr/bin/env python3
"""
patch-dashboard-v3.py — Update the dashboard to:

1. Split the WHEN section into separate DATE and TIME sections
2. Rename "Organizer" label to "Provider"
3. Add an INSTRUCTOR section that renders the instructor name, bio, and photo
4. Add `instructor` and `instructorBio` fields to the CalendarEvent interface

Idempotent — safe to run more than once. Only modifies
app/(dashboard)/dashboard/page.tsx.
"""

from __future__ import annotations
import sys
from pathlib import Path

REPO_ROOT = Path.cwd()
TARGET = REPO_ROOT / "app" / "(dashboard)" / "dashboard" / "page.tsx"

# --- Patch 1: split WHEN into DATE and TIME ---------------------------------
OLD_WHEN = """        {/* WHEN section */}
        {event.startDate && (
          <DetailSection label="When">
            <p className="text-base text-gray-900">{formatEventDateLong(event.startDate)}</p>
            <p className="text-base text-gray-500 font-light">{formatEventTimeRange(event.startDate, event.endDate)}</p>
          </DetailSection>
        )}"""

NEW_WHEN = """        {/* DATE section */}
        {event.startDate && (
          <DetailSection label="Date">
            <p className="text-base text-gray-900">{formatEventDateLong(event.startDate)}</p>
          </DetailSection>
        )}

        {/* TIME section */}
        {event.startDate && (
          <DetailSection label="Time">
            <p className="text-base text-gray-900">{formatEventTimeRange(event.startDate, event.endDate)}</p>
          </DetailSection>
        )}"""

# --- Patch 2: rename Organizer label ----------------------------------------
OLD_ORG = '          <DetailSection label="Organizer">'
NEW_ORG = '          <DetailSection label="Provider">'

# --- Patch 3: add Instructor section after PRICE, before DESCRIPTION --------
ANCHOR = "        {/* DESCRIPTION section */}"
INSTRUCTOR_BLOCK = """        {/* INSTRUCTOR section */}
        {(event.instructor || event.instructorBio || event.imageThumb) && (
          <DetailSection label="Instructor">
            <div className="flex items-start gap-3">
              {event.imageThumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.imageThumb}
                  alt={event.instructor || 'Instructor'}
                  className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                {event.instructor && <p className="text-base text-gray-900">{event.instructor}</p>}
                {event.instructorBio && (
                  <p className="text-sm text-gray-700 font-light leading-relaxed whitespace-pre-wrap mt-2">
                    {event.instructorBio}
                  </p>
                )}
              </div>
            </div>
          </DetailSection>
        )}

        {/* DESCRIPTION section */}"""

# --- Patch 4: extend CalendarEvent interface --------------------------------
OLD_IFACE = """  imageUrl: string | null;
  imageThumb: string | null;
  lat: number | null;"""
NEW_IFACE = """  imageUrl: string | null;
  imageThumb: string | null;
  instructor: string | null;
  instructorBio: string | null;
  lat: number | null;"""


def main() -> int:
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found. Run this from the repo root.", file=sys.stderr)
        return 1

    text = TARGET.read_text(encoding="utf-8")
    changes = 0

    if NEW_WHEN.split("\n", 1)[0] in text and "label=\"Date\"" in text:
        print("Date/Time split: already patched.")
    elif OLD_WHEN in text:
        text = text.replace(OLD_WHEN, NEW_WHEN)
        changes += 1
        print("Date/Time split: patched.")
    else:
        print("WARNING: WHEN section not found in expected form.", file=sys.stderr)

    if NEW_ORG in text:
        print("Provider label: already patched.")
    elif OLD_ORG in text:
        text = text.replace(OLD_ORG, NEW_ORG)
        changes += 1
        print("Provider label: patched.")
    else:
        print("WARNING: Organizer label not found in expected form.", file=sys.stderr)

    if "{/* INSTRUCTOR section */}" in text:
        print("Instructor section: already patched.")
    elif ANCHOR in text:
        text = text.replace(ANCHOR, INSTRUCTOR_BLOCK)
        changes += 1
        print("Instructor section: patched.")
    else:
        print("WARNING: DESCRIPTION anchor not found.", file=sys.stderr)

    if NEW_IFACE in text:
        print("Interface fields: already patched.")
    elif OLD_IFACE in text:
        text = text.replace(OLD_IFACE, NEW_IFACE)
        changes += 1
        print("Interface fields: patched.")
    else:
        print("WARNING: CalendarEvent interface not found in expected form.", file=sys.stderr)

    if changes:
        TARGET.write_text(text, encoding="utf-8")
        print(f"\nWrote {changes} change(s) to {TARGET}")
    else:
        print("\nNo changes needed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
