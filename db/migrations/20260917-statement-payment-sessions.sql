CREATE TABLE IF NOT EXISTS statement_payment_sessions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id              integer REFERENCES advertisers(id) ON DELETE SET NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id   text,
  checkout_url               text NOT NULL,
  invoice_allocations        jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_amount_cents          integer NOT NULL CHECK (base_amount_cents > 0),
  processing_fee_cents       integer NOT NULL DEFAULT 0 CHECK (processing_fee_cents >= 0),
  status                     text NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open','paid','partially_refunded','refunded','expired')),
  expires_at                 timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_statement_payment_sessions_advertiser
  ON statement_payment_sessions(advertiser_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_statement_payment_sessions_payment_intent
  ON statement_payment_sessions(stripe_payment_intent_id);
