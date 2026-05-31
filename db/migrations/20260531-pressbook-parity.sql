-- 20260531-pressbook-parity.sql
-- Adds Pressbook CRM field parity to agreements table + creates renewal_reminders.
-- All ALTER TABLE … ADD COLUMN statements are guarded with IF NOT EXISTS.
-- Run against production Neon: psql $NEON_PROD_URL -f db/migrations/20260531-pressbook-parity.sql

-- ─── agreements: new Pressbook columns ───────────────────────────────────────

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS address               text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS city                  text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS state                 text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS zip                   text;

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS discount_cents            int;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS ad_premium_cents          int;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS total_monthly_rate_cents  int;

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS page_position         text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS ad_timing_months      jsonb;

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS bill_to               text DEFAULT 'Advertiser';
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS billing_contact_name  text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS billing_contact_phone text;

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS card_type             text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cardholder_name       text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS card_number_last4     text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS card_expiration       text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cardholder_address    text;

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS signer_name           text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS terms_accepted        boolean;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS terms_accepted_at     timestamptz;

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS attachments           jsonb DEFAULT '{"files":[]}'::jsonb;

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS is_renewal            boolean DEFAULT false;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS renewed_from_id       uuid REFERENCES agreements(id);

-- ─── renewal_reminders ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS renewal_reminders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id     uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  company_name     text,
  rep_name         text,
  email            text,
  ad_size          text,
  frequency        text,
  ad_rate_cents    int,
  exp_date         date,
  remind_date      date,
  status           text NOT NULL DEFAULT 'Pending'
                     CHECK (status IN ('Pending','Completed','Dismissed')),
  note             text,
  triggered_by     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
