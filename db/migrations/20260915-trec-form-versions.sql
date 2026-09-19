CREATE TABLE IF NOT EXISTS trec_form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_number TEXT NOT NULL,
  effective_date DATE NOT NULL,
  pdf_url TEXT NOT NULL,
  page_count INTEGER NOT NULL CHECK (page_count > 0),
  field_catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
  page_sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_number, effective_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS trec_form_versions_one_active_idx
ON trec_form_versions (is_active)
WHERE is_active = true;
