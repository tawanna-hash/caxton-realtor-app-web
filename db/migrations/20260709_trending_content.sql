CREATE TABLE IF NOT EXISTS trending_content (
  id SERIAL PRIMARY KEY,
  headline TEXT NOT NULL,
  subheadline TEXT,
  thumbnail_url TEXT,
  article_url TEXT NOT NULL,
  icon_prefix TEXT DEFAULT '🔥',
  markets TEXT[] NOT NULL DEFAULT '{realtyline}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_trending_active
  ON trending_content (is_published, published_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_trending_markets
  ON trending_content USING GIN (markets);
