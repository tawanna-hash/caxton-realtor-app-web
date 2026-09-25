import { getSql, ensureSchema } from '@/lib/db';

let schemaReady: Promise<void> | undefined;
/** Additive, scoped migration. Legacy published rows remain approved and live. */
export function ensureHotspotWorkspace() {
  if (!schemaReady) schemaReady = (async () => {
    await ensureSchema();
    const sql = getSql();
    await sql`ALTER TABLE magazine_hotspots
      ADD COLUMN IF NOT EXISTS review_status TEXT,
      ADD COLUMN IF NOT EXISTS editor_locked BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS editor_hidden BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS editor_version INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS detection JSONB`;
    await sql`CREATE TABLE IF NOT EXISTS magazine_hotspot_scans (
      magazine_id BIGINT NOT NULL REFERENCES magazines(id) ON DELETE CASCADE ON UPDATE CASCADE,
      page_idx INTEGER NOT NULL,
      status TEXT NOT NULL,
      warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      found INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (magazine_id, page_idx)
    )`;
  })().catch((err) => { schemaReady = undefined; throw err; });
  return schemaReady;
}
