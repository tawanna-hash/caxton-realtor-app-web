CREATE TABLE IF NOT EXISTS testimonial_profiles (
  realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  collection_token TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  professional_title TEXT,
  company TEXT,
  bio TEXT,
  headshot_url TEXT,
  default_market TEXT NOT NULL DEFAULT 'austin',
  default_global BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY,
  realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_title TEXT,
  client_company TEXT,
  rating SMALLINT,
  format TEXT NOT NULL DEFAULT 'text',
  video_url TEXT,
  image_url TEXT,
  transcript TEXT,
  source_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  markets TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_global BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  submitted_via TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT testimonials_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  CONSTRAINT testimonials_format_check CHECK (format IN ('text', 'video')),
  CONSTRAINT testimonials_status_check CHECK (status IN ('pending', 'published', 'archived')),
  CONSTRAINT testimonials_source_check CHECK (submitted_via IN ('owner', 'collection_link', 'admin'))
);

CREATE INDEX IF NOT EXISTS testimonials_owner_idx
  ON testimonials (realtor_id, status, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS testimonials_status_idx
  ON testimonials (status, created_at DESC);
