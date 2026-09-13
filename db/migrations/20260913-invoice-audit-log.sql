ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS audit_log jsonb NOT NULL DEFAULT '[]'::jsonb;
