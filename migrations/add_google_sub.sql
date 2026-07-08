-- Migration: add google_sub column to realtors for native Android Google Sign In
ALTER TABLE realtors
  ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_realtors_google_sub
  ON realtors (google_sub)
  WHERE google_sub IS NOT NULL;
