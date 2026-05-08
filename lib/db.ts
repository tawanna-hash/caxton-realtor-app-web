// caxton-events-v1
// Postgres client for the events feature. Connects to Vercel Postgres (Neon
// under the hood) using the auto-injected DATABASE_URL or POSTGRES_URL env
// var. Schema is created on first read/write — no separate migration step.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cached: NeonQueryFunction<false, false> | null = null;
let schemaEnsured = false;

function getConnectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      'No Postgres connection string found. Connect a Postgres database to ' +
      'this Vercel project and redeploy. Expected env var: DATABASE_URL or POSTGRES_URL.',
    );
  }
  return url;
}

/** Lazily create and cache the Neon client. */
export function getSql(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  cached = neon(getConnectionString());
  return cached;
}

/**
 * Create the `events` table if it doesn't exist yet. Safe to call on every
 * request — it's a no-op once the table is in place. We also cache the
 * "already ensured" flag in module memory so we don't even hit the DB after
 * the first call within a warm function instance.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      external_source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      publication TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      start_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      location TEXT,
      organizer TEXT,
      organizer_email TEXT,
      website TEXT,
      tags TEXT,
      format TEXT,
      course_number TEXT,
      member_price TEXT,
      nonmember_price TEXT,
      image_url TEXT,
      image_thumb TEXT,
      instructor_name TEXT,
      instructor_bio TEXT,
      hidden BOOLEAN NOT NULL DEFAULT false,
      edited_fields TEXT[] NOT NULL DEFAULT '{}'::text[],
      edited_by TEXT,
      edited_at TIMESTAMPTZ,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT events_external_uniq UNIQUE (external_source, external_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS events_pub_start_idx ON events (publication, start_date)`;
  await sql`CREATE INDEX IF NOT EXISTS events_synced_idx ON events (last_synced_at)`;
  // Idempotent column adds for tables created before instructor support.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS instructor_name TEXT`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS instructor_bio TEXT`;
  // Manual-events admin support (DECISIONS.md #5 — May 8, 2026).
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edited_fields TEXT[] NOT NULL DEFAULT '{}'::text[]`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edited_by TEXT`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`;
  schemaEnsured = true;
}
