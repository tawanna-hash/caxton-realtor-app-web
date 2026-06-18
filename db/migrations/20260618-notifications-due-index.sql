-- 20260618-notifications-due-index.sql
-- Speeds up the send-scheduled-notifications cron, which runs every minute
-- and selects rows where status='scheduled' AND scheduled_for <= NOW().
-- Without this index PG full-scans the notifications table every minute.
--
-- Partial index keeps the index tiny: only un-sent, scheduled rows are in it.
-- Idempotent: safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_due
  ON notifications (scheduled_for)
  WHERE status = 'scheduled'::notification_status_enum
    AND scheduled_for IS NOT NULL;
