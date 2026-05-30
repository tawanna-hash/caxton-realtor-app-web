// app/api/admin/migrate-advertisers-extend/route.ts
//
// Revised Step 1: advertisers IS the clients table. Rather than
// creating a parallel `clients` table, we extend `advertisers` in
// place with the PressBook contact fields we need. Idempotent.
//
// Auth: requires getCurrentAdmin().

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIGRATION_NAME = '2026_05_29__extend_advertisers_as_clients';

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const results: string[] = [];
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); results.push(`${label}: ok`); }
    catch (e: unknown) { results.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
  };

  // CRM classification + lifecycle ---------------------------------
  await step('type',          () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'advertiser'`);
  await step('status',        () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);

  // Identity --------------------------------------------------------
  await step('first_name',     () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS first_name text`);
  await step('last_name',      () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS last_name text`);
  await step('company',        () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS company text`);
  await step('title',          () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS title text`);
  await step('industry',       () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS industry text`);
  await step('license_number', () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS license_number text`);
  await step('avatar_url',     () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS avatar_url text`);

  // Channels --------------------------------------------------------
  await step('portal_email',  () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS portal_email text`);
  await step('phone',         () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS phone text`);
  await step('office_phone',  () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS office_phone text`);
  await step('website',       () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS website text`);

  // Verification ----------------------------------------------------
  await step('email_status',      () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS email_status text`);
  await step('email_verified_at', () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`);

  // Address ---------------------------------------------------------
  await step('address',   () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS address text`);
  await step('address_2', () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS address_2 text`);
  await step('city',      () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS city text`);
  await step('state',     () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS state text`);
  await step('zip',       () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS zip text`);

  // Portal linkage --------------------------------------------------
  await step('portal_activated_at', () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS portal_activated_at timestamptz`);
  await step('portal_onboarded_at', () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS portal_onboarded_at timestamptz`);

  // Free-form -------------------------------------------------------
  await step('additional_contacts', () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS additional_contacts jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await step('notes',               () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS notes text`);
  await step('tags',                () => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb`);

  // Indexes ---------------------------------------------------------
  await step('idx type',          () => sql`CREATE INDEX IF NOT EXISTS idx_advertisers_type   ON advertisers(type)`);
  await step('idx status',        () => sql`CREATE INDEX IF NOT EXISTS idx_advertisers_status ON advertisers(status)`);
  await step('idx email',         () => sql`CREATE INDEX IF NOT EXISTS idx_advertisers_email  ON advertisers(lower(contact_email))`);

  // Record migration ------------------------------------------------
  await step('record', () => sql`INSERT INTO schema_migrations (name) VALUES (${MIGRATION_NAME}) ON CONFLICT (name) DO NOTHING`);

  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='advertisers' ORDER BY ordinal_position`;
  const counts = await sql`SELECT count(*)::int AS n FROM advertisers`;

  return NextResponse.json({ migration: MIGRATION_NAME, results, advertisers_total: counts[0]?.n, columns: cols });
}
