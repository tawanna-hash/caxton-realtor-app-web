-- Video ad creatives. Mirrors the idempotent ALTERs in lib/db.ts ensureSchema().
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image';
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(6,2);
