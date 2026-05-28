#!/usr/bin/env python3
# auth-401-patch.py
#
# Fixes the "Unauthorized" stale-data bug on /admin/advertisers.
#
# Problem: when the admin session expires, the client reload() fetch to
# /api/admin/advertisers returns 401. The current code just sets an error
# string and leaves the previously-rendered (stale, default-branded) rows on
# screen — which is what made every advertiser look like RealtyLine.
#
# Fix: detect a 401 on the list fetch and the save fetch, and redirect to
# /admin/login (the same destination the server-rendered admin pages use via
# redirect('/admin/login')). This turns a confusing silent-stale state into a
# clear "log back in" flow.
#
# Changes (all in app/admin/advertisers/AdvertisersClient.tsx):
#   1. import useRouter from next/navigation
#   2. instantiate const router = useRouter() in the component
#   3. reload(): on res.status === 401 -> router.push('/admin/login')
#   4. EditModal save: on res.status === 401 -> redirect to login too
#
# Idempotent; refuses to run unless anchors match exactly. Backs up to
# .bak.auth401. Run from repo root:  python3 auth-401-patch.py

import sys, os, shutil

TARGET = "app/admin/advertisers/AdvertisersClient.tsx"

# --- Edit 1: add useRouter to the next/navigation imports (or add the import) ---
# The file imports from 'react' on the first import line. We add a navigation
# import right after the React import.
REACT_IMPORT = "import { useCallback, useState } from 'react';"
REACT_IMPORT_NEW = (
    "import { useCallback, useState } from 'react';\n"
    "import { useRouter } from 'next/navigation';"
)

# --- Edit 2: instantiate router at the top of the default-export component ---
# Anchor: the reload useCallback is the first hook in the component. We insert
# the router line just before it.
RELOAD_ANCHOR = "  const reload = useCallback(async () => {"
RELOAD_WITH_ROUTER = (
    "  const router = useRouter();\n\n"
    "  const reload = useCallback(async () => {"
)

# --- Edit 3: handle 401 inside reload() ---
RELOAD_FETCH_OLD = (
    "      const res = await fetch('/api/admin/advertisers', { cache: 'no-store' });\n"
    "      if (!res.ok) throw new Error(`HTTP ${res.status}`);"
)
RELOAD_FETCH_NEW = (
    "      const res = await fetch('/api/admin/advertisers', { cache: 'no-store' });\n"
    "      if (res.status === 401) { router.push('/admin/login'); return; }\n"
    "      if (!res.ok) throw new Error(`HTTP ${res.status}`);"
)

# router must be a dependency of the reload useCallback (currently []).
RELOAD_DEPS_OLD = "  }, []);\n\n  const openCreate"
RELOAD_DEPS_NEW = "  }, [router]);\n\n  const openCreate"

# --- Edit 4: handle 401 in the EditModal save ---
SAVE_FETCH_OLD = (
    "      if (!res.ok) {\n"
    "        const body = await res.json().catch(() => ({}));\n"
    "        throw new Error(body.error || `HTTP ${res.status}`);\n"
    "      }"
)
SAVE_FETCH_NEW = (
    "      if (res.status === 401) {\n"
    "        onError('Your session expired. Please log in again.');\n"
    "        return;\n"
    "      }\n"
    "      if (!res.ok) {\n"
    "        const body = await res.json().catch(() => ({}));\n"
    "        throw new Error(body.error || `HTTP ${res.status}`);\n"
    "      }"
)

MARKER = "import { useRouter } from 'next/navigation';"


def fail(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def main():
    if not os.path.isfile(TARGET):
        fail(f"{TARGET} not found. Run from repo root.")

    with open(TARGET, "r", encoding="utf-8") as f:
        src = f.read()

    if MARKER in src:
        print("  [skip] useRouter already imported — patch appears applied.")
        return

    # Verify all anchors exist exactly once before touching anything.
    anchors = [
        ("React import", REACT_IMPORT),
        ("reload anchor", RELOAD_ANCHOR),
        ("reload fetch", RELOAD_FETCH_OLD),
        ("reload deps []", RELOAD_DEPS_OLD),
        ("save fetch block", SAVE_FETCH_OLD),
    ]
    for name, a in anchors:
        c = src.count(a)
        if c != 1:
            fail(f"{name} found {c} times (expected 1). Paste the relevant section so I can adjust.")

    backup = TARGET + ".bak.auth401"
    if not os.path.isfile(backup):
        shutil.copy2(TARGET, backup)
        print(f"  Backup -> {backup}")

    src = src.replace(REACT_IMPORT, REACT_IMPORT_NEW, 1)
    print("  [ok]   Edit 1 — imported useRouter")
    src = src.replace(RELOAD_ANCHOR, RELOAD_WITH_ROUTER, 1)
    print("  [ok]   Edit 2 — instantiated router")
    src = src.replace(RELOAD_FETCH_OLD, RELOAD_FETCH_NEW, 1)
    print("  [ok]   Edit 3 — reload() redirects to login on 401")
    src = src.replace(RELOAD_DEPS_OLD, RELOAD_DEPS_NEW, 1)
    print("  [ok]   Edit 3b — added router to reload deps")
    src = src.replace(SAVE_FETCH_OLD, SAVE_FETCH_NEW, 1)
    print("  [ok]   Edit 4 — save shows session-expired message on 401")

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(src)

    print("\nDone. Verify with:")
    print(f'  grep -n "useRouter\\|401\\|admin/login" "{TARGET}"')


if __name__ == "__main__":
    main()
