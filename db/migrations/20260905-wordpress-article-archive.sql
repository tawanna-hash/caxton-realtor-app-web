CREATE TABLE IF NOT EXISTS wp_article_archive (
  publication TEXT NOT NULL CHECK (publication IN ('austin', 'san_antonio')),
  wp_post_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  head TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  image_thumb TEXT,
  author_name TEXT NOT NULL DEFAULT 'Staff',
  author_avatar TEXT,
  cat TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  published_at TIMESTAMPTZ NOT NULL,
  modified_at TIMESTAMPTZ,
  source_url TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (publication, wp_post_id),
  UNIQUE (publication, slug)
);

CREATE INDEX IF NOT EXISTS idx_wp_article_archive_publication_date
  ON wp_article_archive (publication, published_at DESC);

