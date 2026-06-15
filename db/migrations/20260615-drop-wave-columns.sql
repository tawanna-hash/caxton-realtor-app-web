-- 20260615-drop-wave-columns.sql
--
-- Drop Wave Accounting integration columns + indexes. The Wave sync code
-- (lib/wave-direct.ts, lib/wave-webhook.ts, /api/cron/retry-wave-sync) has
-- been removed; these columns are now unreferenced and safe to drop.
--
-- Idempotent: uses IF EXISTS so re-running is a no-op.

DROP INDEX IF EXISTS idx_agreements_wave_pending;
ALTER TABLE agreements DROP COLUMN IF EXISTS wave_invoice_id;
ALTER TABLE agreements DROP COLUMN IF EXISTS wave_invoice_synced_at;
ALTER TABLE agreements DROP COLUMN IF EXISTS wave_sync_error;
ALTER TABLE agreements DROP COLUMN IF EXISTS wave_sync_attempts;

DROP INDEX IF EXISTS idx_issue_charges_wave_pending;
ALTER TABLE issue_charges DROP COLUMN IF EXISTS wave_invoice_id;
ALTER TABLE issue_charges DROP COLUMN IF EXISTS wave_invoice_synced_at;
ALTER TABLE issue_charges DROP COLUMN IF EXISTS wave_sync_error;
ALTER TABLE issue_charges DROP COLUMN IF EXISTS wave_sync_attempts;
