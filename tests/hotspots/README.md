# Hotspot workspace regression tests

Run `npm run test:hotspots`. Tests use the production route, migration, extractors, and review helpers against embedded PostgreSQL, synthetic PDFs/QR codes, and a mocked vision response. No production credentials or records are used.

Coverage includes additive schema initialization, spatial deduplication, drafts-only imports, incomplete destination checks, corrected/rejected detection preservation, atomic versioned batch updates, visibility/lock isolation, soft deletion, authentication, safe destination protocols, multiple and rotated QR codes, PDF links and contacts, and all visual detection categories including unknown logos.

Rescan and cleanup regressions also cover shifted legacy links without provenance, page-wide destination matching, www/tracking variants, matched partners, nested duplicate boxes, string database IDs, invalid legacy data removal, preservation of distinct destinations/placements, and meaningful query strings and ports. The suite contains 22 regression checks.

The UI was separately exercised in Chromium at desktop and 375px mobile widths using the actual components with an isolated fixture backend. Checks covered approval/publication, hide/show, lock/unlock, modal drag and destination preview, label edits, undo/redo, rejection/restoration/deletion, drag/resize/nudge, layer ordering, failed-save recovery, spatial cleanup, page navigation, spreads, zoom, search/grouping, streamed scan states, copying drafts, and manual creation.
