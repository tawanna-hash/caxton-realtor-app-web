// app/api/admin/migrate-marketing-campaigns/route.ts
//
// Step 4 of PressBook CRM integration: marketing campaigns, tasks,
// and outreach.
//
// Distinction from existing `ad_campaigns`:
//   • ad_campaigns         = OUTBOUND ad placements purchased by an advertiser.
//                            One row per "X advertiser, Y space, Z dates."
//   • marketing_campaigns  = INBOUND marketing/outreach YOU run to drive
//                            advertiser pipeline. Has audience filter,
//                            brief, tasks, and outreach blasts.
//
// New tables:
//   • marketing_campaigns          (drafts/active/done outreach efforts)
//   • marketing_campaign_tasks     (kanban: to_do / in_progress / done)
//   • marketing_campaign_outreach  (sent batches: email/sms/drip)
//
// All UUID primary keys. Tasks + outreach FK back to campaign with
// ON DELETE CASCADE so deleting a campaign cleans up its children.
//
// Auth: requires getCurrentAdmin().

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIGRATION_NAME = '2026_05_29__marketing_campaigns';

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

  // ── marketing_campaigns ────────────────────────────────────────
  await step('create marketing_campaigns', () => sql`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name            text NOT NULL,
      status          text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','planning','active','completed','archived')),
      type            text,                                      -- "eblast", "cold_outreach", "renewal_push", …
      audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,        -- e.g. { status:["prospect"], tags:["austin"], industry:[…] }
      brief           text,
      goal            text,                                      -- what success looks like
      start_date      date,
      end_date        date,
      publication     text,                                      -- scope to one publication or null = all
      created_by      text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step('idx mc status',      () => sql`CREATE INDEX IF NOT EXISTS idx_mc_status      ON marketing_campaigns(status)`);
  await step('idx mc publication', () => sql`CREATE INDEX IF NOT EXISTS idx_mc_publication ON marketing_campaigns(publication)`);
  await step('idx mc dates',       () => sql`CREATE INDEX IF NOT EXISTS idx_mc_dates       ON marketing_campaigns(start_date, end_date)`);

  await step('trg fn mc', () => sql`
    CREATE OR REPLACE FUNCTION trg_mc_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step('drop trg mc', () => sql`DROP TRIGGER IF EXISTS mc_set_updated_at ON marketing_campaigns`);
  await step('create trg mc', () => sql`
    CREATE TRIGGER mc_set_updated_at
      BEFORE UPDATE ON marketing_campaigns
      FOR EACH ROW EXECUTE FUNCTION trg_mc_set_updated_at()
  `);

  // ── marketing_campaign_tasks ───────────────────────────────────
  await step('create mc_tasks', () => sql`
    CREATE TABLE IF NOT EXISTS marketing_campaign_tasks (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      title       text NOT NULL,
      description text,
      status      text NOT NULL DEFAULT 'to_do'
                   CHECK (status IN ('to_do','in_progress','done')),
      priority    text DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high')),
      due_date    date,
      assignee    text,                                          -- email of admin assigned
      done_at     timestamptz,
      sort_order  integer NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step('idx mct campaign', () => sql`CREATE INDEX IF NOT EXISTS idx_mct_campaign ON marketing_campaign_tasks(campaign_id)`);
  await step('idx mct status',   () => sql`CREATE INDEX IF NOT EXISTS idx_mct_status   ON marketing_campaign_tasks(status)`);
  await step('idx mct due_date', () => sql`CREATE INDEX IF NOT EXISTS idx_mct_due_date ON marketing_campaign_tasks(due_date)`);

  await step('trg fn mct', () => sql`
    CREATE OR REPLACE FUNCTION trg_mct_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step('drop trg mct', () => sql`DROP TRIGGER IF EXISTS mct_set_updated_at ON marketing_campaign_tasks`);
  await step('create trg mct', () => sql`
    CREATE TRIGGER mct_set_updated_at
      BEFORE UPDATE ON marketing_campaign_tasks
      FOR EACH ROW EXECUTE FUNCTION trg_mct_set_updated_at()
  `);

  // ── marketing_campaign_outreach ────────────────────────────────
  // One row per send (an email blast, a batch of SMS, a drip trigger).
  // Pre-send: status=scheduled, recipient_ids populated. Post-send:
  // sent_at + delivery stats from Resend webhook.
  await step('create mc_outreach', () => sql`
    CREATE TABLE IF NOT EXISTS marketing_campaign_outreach (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id     uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      channel         text NOT NULL DEFAULT 'email'
                       CHECK (channel IN ('email','sms','drip')),
      subject         text,
      body            text,
      template_id     text,                                      -- if using a Resend template
      status          text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
      scheduled_for   timestamptz,
      sent_at         timestamptz,
      -- IDs of advertisers in the send. Materialized at send time
      -- from the campaign's audience_filter.
      recipient_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,        -- integer[] as JSON
      recipient_count integer,
      -- Delivery stats from Resend webhook (delivered, opened, clicked, bounced, complained)
      stats           jsonb NOT NULL DEFAULT '{}'::jsonb,
      error_message   text,
      created_by      text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step('idx mco campaign',  () => sql`CREATE INDEX IF NOT EXISTS idx_mco_campaign  ON marketing_campaign_outreach(campaign_id)`);
  await step('idx mco status',    () => sql`CREATE INDEX IF NOT EXISTS idx_mco_status    ON marketing_campaign_outreach(status)`);
  await step('idx mco scheduled', () => sql`CREATE INDEX IF NOT EXISTS idx_mco_scheduled ON marketing_campaign_outreach(scheduled_for) WHERE status = 'scheduled'`);

  await step('trg fn mco', () => sql`
    CREATE OR REPLACE FUNCTION trg_mco_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step('drop trg mco', () => sql`DROP TRIGGER IF EXISTS mco_set_updated_at ON marketing_campaign_outreach`);
  await step('create trg mco', () => sql`
    CREATE TRIGGER mco_set_updated_at
      BEFORE UPDATE ON marketing_campaign_outreach
      FOR EACH ROW EXECUTE FUNCTION trg_mco_set_updated_at()
  `);

  // Record migration ------------------------------------------------
  await step('record', () => sql`
    INSERT INTO schema_migrations (name) VALUES (${MIGRATION_NAME}) ON CONFLICT (name) DO NOTHING
  `);

  const counts = await sql`
    SELECT
      (SELECT count(*)::int FROM marketing_campaigns)         AS campaigns,
      (SELECT count(*)::int FROM marketing_campaign_tasks)    AS tasks,
      (SELECT count(*)::int FROM marketing_campaign_outreach) AS outreach
  `;
  return NextResponse.json({ migration: MIGRATION_NAME, status: 'applied', results, counts: counts[0] });
}
