// app/api/admin/migrate-agreements-invoices/route.ts
//
// Step 3 of PressBook CRM integration: agreements + invoices.
//
// New tables:
//   • agreements — contracts between Caxton and an advertiser. Holds
//     contract terms, signature state, payment mode, ad placement
//     specs, and a Stripe linkage so paid status is canonical.
//   • invoices  — billable instances of an agreement (or standalone
//     ad-hoc charges). Mirrors PressBook's `invoices` shape.
//
// Existing-table additions:
//   • ad_campaigns.advertiser_id  — FK link to advertisers (currently
//     bound by free-text `advertiser_name` only). Backfilled by name.
//   • ad_campaigns.agreement_id   — optional link from a running
//     campaign to the contract it was sold under.
//
// Idempotent: every statement uses IF NOT EXISTS / ON CONFLICT, plus
// a top-level short-circuit checking schema_migrations.
//
// Auth: requires getCurrentAdmin().

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIGRATION_NAME = '2026_05_29__agreements_and_invoices';

export const POST = withAdminTracking(async function POST() {
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

  // ── 1. agreements ─────────────────────────────────────────────
  // Field map vs PressBook (pressbook → caxton):
  //   contactId           → advertiser_id
  //   orgId               → (dropped, single-tenant)
  //   advertiserEmail     → (use advertisers.contact_email)
  //   adRate (cents/issue)→ ad_rate_cents
  //   amount (cents)      → amount_cents
  //   stripeCustomerId    → stripe_customer_id (also on advertisers, here for snapshot)
  //   audit_log JSON      → audit_log
  //   eblast_packages     → eblast_packages
  await step('create agreements', () => sql`
    CREATE TABLE IF NOT EXISTS agreements (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id            integer REFERENCES advertisers(id) ON DELETE SET NULL,

      -- Snapshot of identity at signing time (so reissues/changes
      -- to advertisers don't rewrite history).
      company_name             text,
      rep_name                 text,
      advertiser_email         text,
      advertiser_phone         text,
      advertiser_address       text,

      -- Contract terms
      type                     text,                                    -- "print_ad" | "eblast" | "sponsored_content" | …
      status                   text NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','sent','signed','active','expired','cancelled')),
      start_date               date,
      end_date                 date,

      -- Ad placement specifics
      ad_size                  text,
      frequency                text,                                    -- "monthly", "weekly", "one_time", …
      ad_rate_cents            integer,                                 -- price per issue (cents)
      ad_timing                jsonb,                                   -- { months: [...], years: <n> }
      eblast_packages          jsonb NOT NULL DEFAULT '[]'::jsonb,

      -- Money (denormalized total for quick display; canonical truth
      -- lives in the invoices row(s) tied to this agreement).
      amount_cents             integer,

      -- Signature lifecycle
      sign_date                date,
      exp_date                 date,
      renewal_notice_date      date,
      signed_at                timestamptz,
      signed_document          text,                                    -- url or base64 data URL
      sent_to_email            text,
      is_uploaded              boolean NOT NULL DEFAULT false,

      -- Billing
      billing_name             text,
      billing_email            text,
      payment_mode             text CHECK (payment_mode IN ('card','link','invoice','check')),

      -- Stripe linkage (also denormalized; canonical IDs on invoices)
      stripe_customer_id       text,
      stripe_invoice_id        text,
      stripe_payment_intent_id text,
      stripe_payment_link_url  text,
      paid_at                  timestamptz,

      -- Free-form
      notes                    text,
      audit_log                jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by               text,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now()
    )
  `);

  await step('idx agreements partner',     () => sql`CREATE INDEX IF NOT EXISTS idx_agreements_advertiser_id ON agreements(advertiser_id)`);
  await step('idx agreements status',         () => sql`CREATE INDEX IF NOT EXISTS idx_agreements_status        ON agreements(status)`);
  await step('idx agreements end_date',       () => sql`CREATE INDEX IF NOT EXISTS idx_agreements_end_date      ON agreements(end_date)`);
  await step('idx agreements stripe_customer',() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_stripe_cust   ON agreements(stripe_customer_id)`);
  await step('idx agreements stripe_invoice', () => sql`CREATE INDEX IF NOT EXISTS idx_agreements_stripe_inv    ON agreements(stripe_invoice_id)`);

  await step('trg fn agreements', () => sql`
    CREATE OR REPLACE FUNCTION trg_agreements_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step('drop trg agreements', () => sql`DROP TRIGGER IF EXISTS agreements_set_updated_at ON agreements`);
  await step('create trg agreements', () => sql`
    CREATE TRIGGER agreements_set_updated_at
      BEFORE UPDATE ON agreements
      FOR EACH ROW EXECUTE FUNCTION trg_agreements_set_updated_at()
  `);

  // ── 2. invoices ───────────────────────────────────────────────
  await step('create invoices', () => sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id            integer NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
      agreement_id             uuid    REFERENCES agreements(id) ON DELETE SET NULL,

      -- Human-readable invoice number (e.g. RLM-2026-0023). Unique
      -- when present; sequence/number generation handled in app code.
      number                   text UNIQUE,

      -- Money in cents (canonical). Currency assumed USD.
      amount_cents             integer NOT NULL,
      tax_cents                integer NOT NULL DEFAULT 0,
      total_cents              integer GENERATED ALWAYS AS (amount_cents + tax_cents) STORED,

      status                   text NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','sent','paid','overdue','void')),

      -- Stripe linkage
      stripe_invoice_id        text,
      stripe_payment_intent_id text,
      stripe_payment_link_url  text,

      -- Lifecycle dates
      issued_at                timestamptz,
      due_date                 date,
      paid_at                  timestamptz,
      voided_at                timestamptz,

      -- Snapshots of biller-payee at issue time (so address changes
      -- on advertisers don't rewrite history).
      bill_to_name             text,
      bill_to_email            text,
      bill_to_address          text,

      memo                     text,
      line_items               jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{ description, qty, unit_cents }]
      created_by               text,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step('idx invoices partner',  () => sql`CREATE INDEX IF NOT EXISTS idx_invoices_advertiser_id ON invoices(advertiser_id)`);
  await step('idx invoices agreement',   () => sql`CREATE INDEX IF NOT EXISTS idx_invoices_agreement_id  ON invoices(agreement_id)`);
  await step('idx invoices status',      () => sql`CREATE INDEX IF NOT EXISTS idx_invoices_status        ON invoices(status)`);
  await step('idx invoices due_date',    () => sql`CREATE INDEX IF NOT EXISTS idx_invoices_due_date      ON invoices(due_date)`);
  await step('idx invoices stripe_inv',  () => sql`CREATE INDEX IF NOT EXISTS idx_invoices_stripe_inv    ON invoices(stripe_invoice_id)`);

  await step('trg fn invoices', () => sql`
    CREATE OR REPLACE FUNCTION trg_invoices_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step('drop trg invoices', () => sql`DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices`);
  await step('create trg invoices', () => sql`
    CREATE TRIGGER invoices_set_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION trg_invoices_set_updated_at()
  `);

  // ── 3. ad_campaigns linkage ───────────────────────────────────
  // Add proper FK to advertisers (currently text-only). Backfill by
  // case-insensitive name match within the same publication.
  await step('add ad_campaigns.advertiser_id', () => sql`
    ALTER TABLE ad_campaigns
      ADD COLUMN IF NOT EXISTS advertiser_id integer
        REFERENCES advertisers(id) ON DELETE SET NULL
  `);
  await step('add ad_campaigns.agreement_id', () => sql`
    ALTER TABLE ad_campaigns
      ADD COLUMN IF NOT EXISTS agreement_id uuid
        REFERENCES agreements(id) ON DELETE SET NULL
  `);
  await step('idx ad_campaigns.advertiser_id', () => sql`
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser_id ON ad_campaigns(advertiser_id)
  `);
  await step('idx ad_campaigns.agreement_id', () => sql`
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_agreement_id ON ad_campaigns(agreement_id)
  `);
  await step('backfill ad_campaigns.advertiser_id', () => sql`
    UPDATE ad_campaigns c
    SET advertiser_id = a.id
    FROM advertisers a
    WHERE c.advertiser_id IS NULL
      AND lower(a.name) = lower(c.advertiser_name)
      AND a.publication = c.publication
  `);

  // ── 4. Record migration ──────────────────────────────────────
  await step('record', () => sql`
    INSERT INTO schema_migrations (name) VALUES (${MIGRATION_NAME})
    ON CONFLICT (name) DO NOTHING
  `);

  // ── Verification ─────────────────────────────────────────────
  const agreementsCount = await sql`SELECT count(*)::int AS n FROM agreements`;
  const invoicesCount   = await sql`SELECT count(*)::int AS n FROM invoices`;
  const campaignsLinked = await sql`SELECT count(*)::int AS n FROM ad_campaigns WHERE advertiser_id IS NOT NULL`;
  const campaignsTotal  = await sql`SELECT count(*)::int AS n FROM ad_campaigns`;

  return NextResponse.json({
    migration: MIGRATION_NAME,
    status: 'applied',
    results,
    verification: {
      agreements_total: agreementsCount[0]?.n,
      invoices_total:   invoicesCount[0]?.n,
      ad_campaigns_linked: campaignsLinked[0]?.n,
      ad_campaigns_total:  campaignsTotal[0]?.n,
    },
  });
});
