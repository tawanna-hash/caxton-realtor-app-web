#!/usr/bin/env python3
# phase6e-patch.py
#
# Adds the "Advertisers" tab to app/admin/reports/page.tsx:
#   1. Import AdvertisersReportTab.
#   2. Widen the activeTab union to include 'advertisers'.
#   3. Add the tab button to the tabs array.
#   4. Render <AdvertisersReportTab /> when active, before the page's closing </div>.
#
# Idempotent; refuses to write unless each anchor is found exactly once.
# Run from repo root:  python3 phase6e-patch.py

import sys, os, shutil

TARGET = "app/admin/reports/page.tsx"

# --- Edit 1: import (after the EventReportPreview import line) ---
IMPORT_ANCHOR = "import { EventReportPreview, buildEventReportHtml, buildEventReportPlainText } from './_components/EventReportPreview';"
IMPORT_ADD = IMPORT_ANCHOR + "\nimport AdvertisersReportTab from './_components/AdvertisersReportTab';"

# --- Edit 2: widen the activeTab union ---
TAB_STATE_OLD = "const [activeTab, setActiveTab] = useState<'articles' | 'events'>('articles');"
TAB_STATE_NEW = "const [activeTab, setActiveTab] = useState<'articles' | 'events' | 'advertisers'>('articles');"

# --- Edit 3: add the tab button to the tabs array ---
TABS_OLD = """            { key: 'articles', label: 'Articles' },
            { key: 'events', label: 'Events' },"""
TABS_NEW = """            { key: 'articles', label: 'Articles' },
            { key: 'events', label: 'Events' },
            { key: 'advertisers', label: 'Advertisers' },"""

# --- Edit 4: render the tab content before the final closing </div> ---
# The file ends with:
#       </>
#       )}
#
#     </div>
#   );
# }
# We insert the advertisers block right before the "    </div>\n  );\n}" tail.
TAIL_OLD = """      </>
      )}

    </div>
  );
}"""
TAIL_NEW = """      </>
      )}

      {activeTab === 'advertisers' && (
        <AdvertisersReportTab />
      )}

    </div>
  );
}"""

MARKER = "import AdvertisersReportTab from './_components/AdvertisersReportTab';"


def fail(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def main():
    if not os.path.isfile(TARGET):
        fail(f"{TARGET} not found. Run from repo root.")

    with open(TARGET, "r", encoding="utf-8") as f:
        src = f.read()

    if MARKER in src:
        print("  [skip] AdvertisersReportTab already imported.")
        if "<AdvertisersReportTab />" not in src:
            fail("Import present but tab not rendered. Manual review needed.")
        print("  [ok]   Tab already rendered. Fully patched.")
        return

    for name, anchor in [
        ("import", IMPORT_ANCHOR),
        ("activeTab state", TAB_STATE_OLD),
        ("tabs array", TABS_OLD),
        ("file tail", TAIL_OLD),
    ]:
        if src.count(anchor) != 1:
            fail(f"{name} anchor found {src.count(anchor)} times (expected 1). "
                 f"Paste the relevant section so I can adjust.")

    backup = TARGET + ".bak.phase6e"
    if not os.path.isfile(backup):
        shutil.copy2(TARGET, backup)
        print(f"  Backup -> {backup}")

    src = src.replace(IMPORT_ANCHOR, IMPORT_ADD, 1)
    print("  [ok]   Edit 1 — imported AdvertisersReportTab")
    src = src.replace(TAB_STATE_OLD, TAB_STATE_NEW, 1)
    print("  [ok]   Edit 2 — widened activeTab union")
    src = src.replace(TABS_OLD, TABS_NEW, 1)
    print("  [ok]   Edit 3 — added Advertisers tab button")
    src = src.replace(TAIL_OLD, TAIL_NEW, 1)
    print("  [ok]   Edit 4 — rendered tab content")

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(src)

    print("\nDone. Verify with:")
    print('  grep -n "AdvertisersReportTab\\|advertisers" ' + f'"{TARGET}"')


if __name__ == "__main__":
    main()
