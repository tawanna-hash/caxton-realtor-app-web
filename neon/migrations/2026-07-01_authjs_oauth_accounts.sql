-- Auth.js requires a table to link OAuth provider identities to our
-- existing realtor rows. We keep this table intentionally minimal —
-- everything else lives on realtors.
CREATE TABLE IF NOT EXISTS realtor_oauth_accounts (
  realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,              -- 'apple', 'google', etc.
  provider_account_id TEXT NOT NULL,   -- Apple's `sub` claim
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_account_id),
  UNIQUE (realtor_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_realtor_oauth_realtor
  ON realtor_oauth_accounts (realtor_id);
