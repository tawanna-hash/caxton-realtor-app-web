-- 20260605-monitored-fb-pages.sql
-- Adds monitored_fb_pages: admin-curated list of FB Pages whose recent posts
-- are fetched via headless Chromium and run through Gemini for event detection.
-- Companion to /api/cron/scan-followed-fb-pages.
--
-- Why a new table (not reusing FB_PAGE_IDS env var):
--   * env var only handles Pages we admin (Graph-API path)
--   * this table is for Pages we *follow* (no API access), Chromium-only
--   * admins need a UI to add/remove without redeploying
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS monitored_fb_pages (
  id                BIGSERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,            -- e.g. 'HomeBuildersAssociationGreaterAustin'
  label             TEXT NOT NULL,                   -- e.g. 'HBA Greater Austin'
  pub               TEXT NOT NULL DEFAULT 'austin',  -- 'austin' | 'san_antonio' (which pub picks up its events)
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_scanned_at   TIMESTAMPTZ,
  last_post_count   INTEGER NOT NULL DEFAULT 0,
  last_detected     INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rotate through active pages oldest-first.
CREATE INDEX IF NOT EXISTS idx_monitored_fb_pages_due
  ON monitored_fb_pages (last_scanned_at NULLS FIRST)
  WHERE is_active = TRUE;
