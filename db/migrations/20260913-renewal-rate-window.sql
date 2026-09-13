ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS renewal_offer_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_offer_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agreements_renewal_offer_reminder_due
  ON agreements (renewal_offer_expires_at)
  WHERE is_renewal = true
    AND renewal_offer_reminder_sent_at IS NULL
    AND status IN ('proposal_sent', 'sent');
