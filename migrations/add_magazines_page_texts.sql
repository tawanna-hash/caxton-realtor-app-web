-- Adds page_texts JSONB column to magazines table.
-- Applied in production on 2026-07-16 via manual psql; this file is
-- for local dev branches and future Neon branch creations.
ALTER TABLE magazines
  ADD COLUMN IF NOT EXISTS page_texts JSONB NOT NULL DEFAULT '[]'::jsonb;
