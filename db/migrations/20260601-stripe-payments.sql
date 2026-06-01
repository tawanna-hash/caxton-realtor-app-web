-- 20260601-stripe-payments.sql
-- Stripe + Wave (via Zapier) wiring for agreements.
-- Idempotent: safe to run multiple times.

ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_charged_cents     integer,
  ADD COLUMN IF NOT EXISTS stripe_charged_at        timestamptz,
  ADD COLUMN IF NOT EXISTS wave_invoice_synced_at   timestamptz,
  ADD COLUMN IF NOT EXISTS wave_invoice_id          text;

CREATE INDEX IF NOT EXISTS idx_agreements_stripe_pm ON agreements(stripe_payment_method_id);

-- Track every individual issue charge (recurring monthly charges against the saved card)
CREATE TABLE IF NOT EXISTS issue_charges (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id             uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  amount_cents             integer NOT NULL,
  surcharge_cents          integer NOT NULL DEFAULT 0,
  issue_month              text,                   -- e.g. "2026-07"
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','succeeded','failed','refunded')),
  wave_invoice_id          text,
  wave_invoice_synced_at   timestamptz,
  failure_reason           text,
  charged_at               timestamptz,
  created_by               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_charges_agreement ON issue_charges(agreement_id);
CREATE INDEX IF NOT EXISTS idx_issue_charges_status    ON issue_charges(status);
