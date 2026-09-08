-- QuickBooks Online sandbox integration.
-- Idempotent and safe to run on every environment.

CREATE TABLE IF NOT EXISTS quickbooks_connections (
  environment              text PRIMARY KEY
                             CHECK (environment IN ('sandbox', 'production')),
  realm_id                 text NOT NULL,
  company_name             text,
  access_token_encrypted   text NOT NULL,
  refresh_token_encrypted  text NOT NULL,
  access_token_expires_at  timestamptz NOT NULL,
  refresh_token_expires_at timestamptz,
  scope                    text NOT NULL,
  connected_by             text,
  connected_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quickbooks_entity_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment        text NOT NULL REFERENCES quickbooks_connections(environment) ON DELETE CASCADE,
  local_entity_type  text NOT NULL CHECK (local_entity_type IN ('advertiser', 'invoice', 'payment', 'refund')),
  local_entity_id    text NOT NULL,
  qbo_entity_type    text NOT NULL CHECK (qbo_entity_type IN ('Customer', 'Invoice', 'Payment', 'RefundReceipt')),
  qbo_entity_id      text NOT NULL,
  qbo_sync_token     text,
  last_synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, local_entity_type, local_entity_id, qbo_entity_type)
);

CREATE INDEX IF NOT EXISTS quickbooks_entity_links_qbo_idx
  ON quickbooks_entity_links(environment, qbo_entity_type, qbo_entity_id);

CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment        text NOT NULL,
  operation          text NOT NULL,
  local_entity_type  text,
  local_entity_id    text,
  qbo_entity_type    text,
  qbo_entity_id      text,
  status             text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'skipped')),
  detail             text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quickbooks_sync_log_created_idx
  ON quickbooks_sync_log(environment, created_at DESC);

