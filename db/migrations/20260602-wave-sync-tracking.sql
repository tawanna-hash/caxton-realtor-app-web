-- 20260602-wave-sync-tracking.sql
-- Adds Wave-sync error tracking + idempotency support.
-- Idempotent: safe to run multiple times.
--
-- Why:
--   * wave_invoice_synced_at is now used as an atomic claim flag — a conditional
--     UPDATE reserves the row before the Wave GraphQL calls run, preventing
--     duplicate invoices when Stripe retries a webhook delivery.
--   * wave_sync_error / wave_sync_attempts surface failed deliveries so the
--     backfill cron (/api/cron/retry-wave-sync) can pick them up instead of
--     silently dropping them on the floor.

ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS wave_sync_error    text,
  ADD COLUMN IF NOT EXISTS wave_sync_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE issue_charges
  ADD COLUMN IF NOT EXISTS wave_sync_error    text,
  ADD COLUMN IF NOT EXISTS wave_sync_attempts integer NOT NULL DEFAULT 0;

-- Backfill cron looks up unsynced rows; index speeds that scan.
CREATE INDEX IF NOT EXISTS idx_agreements_wave_pending
  ON agreements (paid_at)
  WHERE paid_at IS NOT NULL AND wave_invoice_synced_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_issue_charges_wave_pending
  ON issue_charges (charged_at)
  WHERE status = 'succeeded' AND wave_invoice_synced_at IS NULL;
