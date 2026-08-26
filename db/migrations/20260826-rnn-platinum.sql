CREATE TABLE IF NOT EXISTS rnn_platinum_entitlements (
  realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inactive',
  source TEXT NOT NULL DEFAULT 'admin',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_end TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rnn_platinum_status_check CHECK (status IN ('active', 'inactive', 'canceled')),
  CONSTRAINT rnn_platinum_source_check CHECK (source IN ('admin', 'stripe', 'trial'))
);

CREATE INDEX IF NOT EXISTS rnn_platinum_customer_idx
  ON rnn_platinum_entitlements (stripe_customer_id);

ALTER TABLE rnn_platinum_entitlements
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE rnn_platinum_entitlements
  DROP CONSTRAINT IF EXISTS rnn_platinum_source_check;
ALTER TABLE rnn_platinum_entitlements
  ADD CONSTRAINT rnn_platinum_source_check CHECK (source IN ('admin', 'stripe', 'trial'));

ALTER TABLE testimonial_profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE testimonial_profiles ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE testimonial_profiles ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE testimonial_profiles ADD COLUMN IF NOT EXISTS x_url TEXT;
ALTER TABLE testimonial_profiles ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE testimonial_profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE testimonial_profiles
  ADD COLUMN IF NOT EXISTS featured_links JSONB NOT NULL DEFAULT '[]'::jsonb;
