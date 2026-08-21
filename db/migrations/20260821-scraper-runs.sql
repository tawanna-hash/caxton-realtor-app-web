-- 20260821 · scraper_runs — one row per scraper, updated in place.
--
-- Powers /admin/content/scrapers "last run" surface. Populated by
-- lib/scraper-runs.ts::recordScraperRun() which the cron/ingest
-- routes call at the end of each run.
--
-- Design choices:
--   - scraper_path is the natural key (e.g. "scrape-hollows"), NOT a
--     synthetic uuid — makes upserts cheap and joins on the admin
--     page trivial.
--   - Only the LATEST run is stored per path. If we need history
--     later, add a scraper_run_events table; for now the admin surface
--     only wants "last run".
--   - row_count = rows actually upserted/created/updated this run.
--   - status is 'ok' | 'error' | 'skipped'. 'skipped' = ran but
--     rawCount=0 or high skip rate.
--   - error_message is nullable, only set when status='error'.

CREATE TABLE IF NOT EXISTS scraper_runs (
  scraper_path   text PRIMARY KEY,
  last_run_at    timestamptz NOT NULL DEFAULT now(),
  duration_ms    integer     NOT NULL DEFAULT 0,
  status         text        NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  row_count      integer     NOT NULL DEFAULT 0,
  raw_count      integer     NOT NULL DEFAULT 0,
  created        integer     NOT NULL DEFAULT 0,
  updated        integer     NOT NULL DEFAULT 0,
  deactivated    integer     NOT NULL DEFAULT 0,
  error_message  text
);

-- Index on last_run_at for "most recent first" listings.
CREATE INDEX IF NOT EXISTS scraper_runs_last_run_at_idx
  ON scraper_runs (last_run_at DESC);
