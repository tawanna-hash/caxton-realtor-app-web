// app/api/admin/migrate-marketing-recurrence/route.ts
//
// Additive migration for recurring marketing sends + multi reply-to.
// Extends marketing_campaign_outreach with:
//   • recurrence_interval_days / recurrence_until / recurrence_parent_id / next_run_at
//   • advertiser_filter / subscriber_filter  (audience DEFINITION for re-materialization)
//   • attachments        (remote Blob URLs reused by recurring children)
//   • reply_to_addresses (multi reply-to array)
//
// Mirrors lib/crm-schema.ts (the runtime idempotent bootstrap) so a cold
// deploy that never hits ensureSchema() can still be migrated explicitly.
// Reversal lives in migrations/2026_07_15__marketing_recurrence.sql.
//
// Auth: requires getCurrentAdmin().

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIGRATION_NAME = '2026_07_15__marketing_recurrence';

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = getSql();
  const results: string[] = [];
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); results.push(`${label}: ok`); }
    catch (e: unknown) { results.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const already = await sql`SELECT 1 FROM schema_migrations WHERE name = ${MIGRATION_NAME} LIMIT 1`;
  if (already.length > 0) {
    return NextResponse.json({ migration: MIGRATION_NAME, status: 'already-applied' });
  }

  await step('recurrence_interval_days', () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS recurrence_interval_days integer`);
  await step('recurrence_until',         () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS recurrence_until timestamptz`);
  await step('recurrence_parent_id',     () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES marketing_campaign_outreach(id) ON DELETE CASCADE`);
  await step('next_run_at',              () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS next_run_at timestamptz`);
  await step('advertiser_filter',        () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS advertiser_filter jsonb`);
  await step('subscriber_filter',        () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS subscriber_filter jsonb`);
  await step('attachments',              () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await step('reply_to_addresses',       () => sql`ALTER TABLE marketing_campaign_outreach ADD COLUMN IF NOT EXISTS reply_to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await step('idx_mco_next_run',         () => sql`CREATE INDEX IF NOT EXISTS idx_mco_next_run ON marketing_campaign_outreach(next_run_at) WHERE next_run_at IS NOT NULL`);

  await step('record', () => sql`
    INSERT INTO schema_migrations (name) VALUES (${MIGRATION_NAME}) ON CONFLICT (name) DO NOTHING
  `);

  return NextResponse.json({ migration: MIGRATION_NAME, status: 'applied', results });
}
