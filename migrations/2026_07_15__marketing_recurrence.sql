-- Migration: recurring marketing sends + multi reply-to
-- Additive + reversible. Extends marketing_campaign_outreach.
-- Runtime equivalent lives in lib/crm-schema.ts (ensureCrmSchema) and
-- app/api/admin/migrate-marketing-recurrence/route.ts.

-- ── Up ──────────────────────────────────────────────────────────────
ALTER TABLE marketing_campaign_outreach
  ADD COLUMN IF NOT EXISTS recurrence_interval_days integer,
  ADD COLUMN IF NOT EXISTS recurrence_until         timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id     uuid REFERENCES marketing_campaign_outreach(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS next_run_at              timestamptz,
  ADD COLUMN IF NOT EXISTS advertiser_filter        jsonb,
  ADD COLUMN IF NOT EXISTS subscriber_filter        jsonb,
  ADD COLUMN IF NOT EXISTS attachments              jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reply_to_addresses       jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_mco_next_run
  ON marketing_campaign_outreach (next_run_at)
  WHERE next_run_at IS NOT NULL;

-- ── Down ────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_mco_next_run;
-- ALTER TABLE marketing_campaign_outreach
--   DROP COLUMN IF EXISTS recurrence_interval_days,
--   DROP COLUMN IF EXISTS recurrence_until,
--   DROP COLUMN IF EXISTS recurrence_parent_id,
--   DROP COLUMN IF EXISTS next_run_at,
--   DROP COLUMN IF EXISTS advertiser_filter,
--   DROP COLUMN IF EXISTS subscriber_filter,
--   DROP COLUMN IF EXISTS attachments,
--   DROP COLUMN IF EXISTS reply_to_addresses;
