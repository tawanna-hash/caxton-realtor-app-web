CREATE TABLE IF NOT EXISTS statement_send_history (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id           integer REFERENCES advertisers(id) ON DELETE SET NULL,
  advertiser_name         text NOT NULL,
  recipient_email         text NOT NULL,
  sender_email            text NOT NULL,
  subject                 text NOT NULL,
  sent_by                 text,
  sent_at                 timestamptz NOT NULL DEFAULT now(),
  message_id              text,
  statement_as_of         timestamptz NOT NULL,
  invoice_count           integer NOT NULL,
  outstanding_cents       integer NOT NULL,
  payment_links_refreshed integer NOT NULL DEFAULT 0,
  invoice_ids             jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_statement_send_history_advertiser_sent
  ON statement_send_history(advertiser_id, sent_at DESC);
