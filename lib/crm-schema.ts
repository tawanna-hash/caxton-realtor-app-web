// lib/crm-schema.ts
//
// Idempotent CRM schema bootstrap. Pulls together every CREATE TABLE
// IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS statement from
// the four migrate-* admin routes (Steps 1, 3, 4, 5 of the PressBook
// CRM integration) so that admin pages self-heal on first request
// instead of requiring a manual POST to /api/admin/migrate-*.
//
// Step 2 (`/admin/crm`) is purely UI on top of the Step 1 columns, so
// it needs no DDL of its own — just Step 1's advertisers extension.
//
// Every statement here MUST be idempotent. If a step fails we swallow
// the error and continue (matching the migrate routes' `step` helper)
// so a single bad statement can't keep the whole app down.
//
// The originating migrate-* routes still work as-is; they remain the
// authoritative manual migration entry points and the only place we
// write a row into `schema_migrations`. This helper does not touch
// `schema_migrations` — it's just a runtime safety net.
//
// Called from lib/db.ts :: ensureSchema().

import type { NeonQueryFunction } from '@neondatabase/serverless';

type Sql = NeonQueryFunction<false, false>;

/**
 * Run every CRM DDL statement, swallowing per-statement errors so one
 * failure doesn't abort the rest. Safe to call repeatedly.
 */
export async function ensureCrmSchema(sql: Sql): Promise<void> {
  const step = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      // Match the migrate-* routes: log and continue so a single
      // broken statement (e.g. a backfill referencing an optional
      // column) never blocks the app.
      console.warn(
        '[ensureCrmSchema] step failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  // ============================================================
  // Step 1 — Extend advertisers as the canonical CRM contacts table.
  // Mirrors app/api/admin/migrate-advertisers-extend/route.ts.
  // ============================================================

  // Classification + lifecycle
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'advertiser'`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);

  // Identity
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS first_name text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS last_name text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS company text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS title text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS industry text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS license_number text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS avatar_url text`);

  // Channels
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS portal_email text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS phone text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS office_phone text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS website text`);

  // Verification
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS email_status text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`);

  // Address
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS address text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS address_2 text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS city text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS state text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS zip text`);

  // Portal linkage
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS portal_activated_at timestamptz`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS portal_onboarded_at timestamptz`);

  // Social URLs (Session 18 — public advertiser detail pages)
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS facebook_url text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS instagram_url text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS linkedin_url text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS twitter_url text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS youtube_url text`);
  // Short tagline shown under the name on the public detail page.
  // `notes` remains internal-only; `tagline` is the public-facing one-liner.
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS tagline text`);
  // Long-form description for the public detail page.
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS bio text`);

  // Free-form
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS additional_contacts jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS notes text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb`);

  // ── Billing↔CRM two-way sync columns (Session 21) ────────────────
  // Mirror the latest agreement's billing/payment/deal facts onto the
  // advertiser row so the CRM detail page can show "current contract"
  // without joining agreements. Columns added in PR A; the helper that
  // writes them ships in PR B.
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS billing_contact_name  text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS billing_contact_phone text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS billing_email         text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS payment_mode          text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS stripe_customer_id    text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS card_last4            text`);
  // current_agreement_id FK is added after the agreements table is created (see below).
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS current_ad_size       text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS current_frequency     text`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS current_ad_rate_cents  integer`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS current_amount_cents   integer`);
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS current_exp_date       date`);

  // Indexes
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertisers_type   ON advertisers(type)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertisers_status ON advertisers(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertisers_email  ON advertisers(lower(contact_email))`);

  // ============================================================
  // Step 3 — agreements + invoices, plus ad_campaigns linkage.
  // Mirrors app/api/admin/migrate-agreements-invoices/route.ts.
  // ============================================================

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS agreements (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id            integer REFERENCES advertisers(id) ON DELETE SET NULL,
      company_name             text,
      rep_name                 text,
      advertiser_email         text,
      advertiser_phone         text,
      advertiser_address       text,
      type                     text,
      status                   text NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','sent','signed','active','expired','cancelled')),
      start_date               date,
      end_date                 date,
      ad_size                  text,
      frequency                text,
      ad_rate_cents            integer,
      ad_timing                jsonb,
      eblast_packages          jsonb NOT NULL DEFAULT '[]'::jsonb,
      amount_cents             integer,
      sign_date                date,
      exp_date                 date,
      renewal_notice_date      date,
      signed_at                timestamptz,
      signed_document          text,
      sent_to_email            text,
      is_uploaded              boolean NOT NULL DEFAULT false,
      billing_name             text,
      billing_email            text,
      payment_mode             text CHECK (payment_mode IN ('card','link','invoice','check')),
      stripe_customer_id       text,
      stripe_invoice_id        text,
      stripe_payment_intent_id text,
      stripe_payment_link_url  text,
      paid_at                  timestamptz,
      notes                    text,
      audit_log                jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by               text,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_advertiser_id ON agreements(advertiser_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_status        ON agreements(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_end_date      ON agreements(end_date)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_stripe_cust   ON agreements(stripe_customer_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_stripe_inv    ON agreements(stripe_invoice_id)`);

  // Now that agreements exists, hang the back-pointer off advertisers.
  // (Listed up top in the Billing↔CRM sync section but deferred to here
  // because the FK requires agreements to exist first on a brand-new DB.)
  await step(() => sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS current_agreement_id uuid REFERENCES agreements(id) ON DELETE SET NULL`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertisers_current_agreement ON advertisers(current_agreement_id)`);

  // Stripe wiring — 20260601-stripe-payments.sql
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS stripe_payment_method_id text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS stripe_charged_cents     integer`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS stripe_charged_at        timestamptz`);

  // Publication / market the agreement belongs to (RealtyLine Austin,
  // Newsline San Antonio, or both). Drives the PUB column on /admin/ads/orders
  // and lets agreement-sourced orders be filtered per-market.
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS publication text`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_publication ON agreements(publication)`);

  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_stripe_pm ON agreements(stripe_payment_method_id)`);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS issue_charges (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agreement_id             uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
      amount_cents             integer NOT NULL,
      surcharge_cents          integer NOT NULL DEFAULT 0,
      issue_month              text,
      stripe_payment_intent_id text,
      stripe_charge_id         text,
      status                   text NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','succeeded','failed','refunded')),
      failure_reason           text,
      charged_at               timestamptz,
      created_by               text,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_issue_charges_agreement ON issue_charges(agreement_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_issue_charges_status    ON issue_charges(status)`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_agreements_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS agreements_set_updated_at ON agreements`);
  await step(() => sql`
    CREATE TRIGGER agreements_set_updated_at
      BEFORE UPDATE ON agreements
      FOR EACH ROW EXECUTE FUNCTION trg_agreements_set_updated_at()
  `);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id            integer NOT NULL REFERENCES advertisers(id) ON DELETE RESTRICT,
      agreement_id             uuid    REFERENCES agreements(id) ON DELETE SET NULL,
      number                   text UNIQUE,
      amount_cents             integer NOT NULL,
      tax_cents                integer NOT NULL DEFAULT 0,
      total_cents              integer GENERATED ALWAYS AS (amount_cents + tax_cents) STORED,
      status                   text NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','sent','paid','overdue','void')),
      stripe_invoice_id        text,
      stripe_payment_intent_id text,
      stripe_payment_link_url  text,
      issued_at                timestamptz,
      due_date                 date,
      paid_at                  timestamptz,
      voided_at                timestamptz,
      bill_to_name             text,
      bill_to_email            text,
      bill_to_address          text,
      memo                     text,
      line_items               jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by               text,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_invoices_advertiser_id ON invoices(advertiser_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_invoices_agreement_id  ON invoices(agreement_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_invoices_status        ON invoices(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_invoices_due_date      ON invoices(due_date)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_invoices_stripe_inv    ON invoices(stripe_invoice_id)`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_invoices_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices`);
  await step(() => sql`
    CREATE TRIGGER invoices_set_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION trg_invoices_set_updated_at()
  `);

  // ad_campaigns linkage
  await step(() => sql`
    ALTER TABLE ad_campaigns
      ADD COLUMN IF NOT EXISTS advertiser_id integer
        REFERENCES advertisers(id) ON DELETE SET NULL
  `);
  await step(() => sql`
    ALTER TABLE ad_campaigns
      ADD COLUMN IF NOT EXISTS agreement_id uuid
        REFERENCES agreements(id) ON DELETE SET NULL
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser_id ON ad_campaigns(advertiser_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_campaigns_agreement_id  ON ad_campaigns(agreement_id)`);

  // ============================================================
  // Step 4 — Marketing campaigns / tasks / outreach.
  // Mirrors app/api/admin/migrate-marketing-campaigns/route.ts.
  // ============================================================

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name            text NOT NULL,
      status          text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','planning','active','completed','archived')),
      type            text,
      audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
      brief           text,
      goal            text,
      start_date      date,
      end_date        date,
      publication     text,
      created_by      text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mc_status      ON marketing_campaigns(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mc_publication ON marketing_campaigns(publication)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mc_dates       ON marketing_campaigns(start_date, end_date)`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_mc_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS mc_set_updated_at ON marketing_campaigns`);
  await step(() => sql`
    CREATE TRIGGER mc_set_updated_at
      BEFORE UPDATE ON marketing_campaigns
      FOR EACH ROW EXECUTE FUNCTION trg_mc_set_updated_at()
  `);

  await step(() => sql`
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
      assignee    text,
      done_at     timestamptz,
      sort_order  integer NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mct_campaign ON marketing_campaign_tasks(campaign_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mct_status   ON marketing_campaign_tasks(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mct_due_date ON marketing_campaign_tasks(due_date)`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_mct_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS mct_set_updated_at ON marketing_campaign_tasks`);
  await step(() => sql`
    CREATE TRIGGER mct_set_updated_at
      BEFORE UPDATE ON marketing_campaign_tasks
      FOR EACH ROW EXECUTE FUNCTION trg_mct_set_updated_at()
  `);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS marketing_campaign_outreach (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id     uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      channel         text NOT NULL DEFAULT 'email'
                       CHECK (channel IN ('email','sms','drip')),
      subject         text,
      body            text,
      template_id     text,
      status          text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
      scheduled_for   timestamptz,
      sent_at         timestamptz,
      recipient_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
      recipient_count integer,
      stats           jsonb NOT NULL DEFAULT '{}'::jsonb,
      error_message   text,
      created_by      text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mco_campaign  ON marketing_campaign_outreach(campaign_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mco_status    ON marketing_campaign_outreach(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mco_scheduled ON marketing_campaign_outreach(scheduled_for) WHERE status = 'scheduled'`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_mco_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS mco_set_updated_at ON marketing_campaign_outreach`);
  await step(() => sql`
    CREATE TRIGGER mco_set_updated_at
      BEFORE UPDATE ON marketing_campaign_outreach
      FOR EACH ROW EXECUTE FUNCTION trg_mco_set_updated_at()
  `);

  // ============================================================
  // Step 5 — Client portal: magic links, files, forms, assignments.
  // Mirrors app/api/admin/migrate-portal/route.ts.
  // ============================================================

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS portal_magic_links (
      id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id       integer     NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
      token_hash          text        NOT NULL UNIQUE,
      purpose             text        NOT NULL DEFAULT 'login',
      link_expires_at     timestamptz NOT NULL,
      consumed_at         timestamptz,
      session_expires_at  timestamptz,
      ip_consumed         text,
      user_agent_consumed text,
      sent_to_email       text,
      sent_at             timestamptz NOT NULL DEFAULT NOW(),
      created_by          text,
      revoked_at          timestamptz,
      revoked_reason      text
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_portal_magic_links_advertiser ON portal_magic_links(advertiser_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_portal_magic_links_session    ON portal_magic_links(session_expires_at) WHERE session_expires_at IS NOT NULL`);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS portal_files (
      id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id   integer     NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
      agreement_id    uuid        REFERENCES agreements(id) ON DELETE SET NULL,
      invoice_id      uuid        REFERENCES invoices(id) ON DELETE SET NULL,
      title           text        NOT NULL,
      description     text,
      file_url        text        NOT NULL,
      file_name       text,
      file_mime       text,
      file_size_bytes integer,
      category        text        NOT NULL DEFAULT 'document',
      visibility      text        NOT NULL DEFAULT 'visible',
      uploaded_by     text,
      created_at      timestamptz NOT NULL DEFAULT NOW(),
      updated_at      timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_portal_files_advertiser ON portal_files(advertiser_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_portal_files_agreement  ON portal_files(agreement_id) WHERE agreement_id IS NOT NULL`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_portal_files_invoice    ON portal_files(invoice_id) WHERE invoice_id IS NOT NULL`);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS portal_forms (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        text        NOT NULL UNIQUE,
      title       text        NOT NULL,
      description text,
      schema      jsonb       NOT NULL DEFAULT '{"fields":[]}'::jsonb,
      active      boolean     NOT NULL DEFAULT true,
      created_by  text,
      created_at  timestamptz NOT NULL DEFAULT NOW(),
      updated_at  timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS portal_form_assignments (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id       uuid        NOT NULL REFERENCES portal_forms(id) ON DELETE CASCADE,
      advertiser_id integer     NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
      status        text        NOT NULL DEFAULT 'pending',
      answers       jsonb       NOT NULL DEFAULT '{}'::jsonb,
      assigned_by   text,
      assigned_at   timestamptz NOT NULL DEFAULT NOW(),
      submitted_at  timestamptz,
      due_at        timestamptz,
      notes         text,
      created_at    timestamptz NOT NULL DEFAULT NOW(),
      updated_at    timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_portal_form_assignments_advertiser ON portal_form_assignments(advertiser_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_portal_form_assignments_form       ON portal_form_assignments(form_id)`);
  await step(() => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_portal_form_assignment_pair
      ON portal_form_assignments(form_id, advertiser_id)
      WHERE submitted_at IS NULL
  `);

  // ============================================================
  // Mailing list (ported from PressBook CRM /mailing module).
  // Single-tenant flat table — `segment` mirrors PressBook's
  // tags-based discriminator. Optional `advertiser_id` FK so rows
  // that originated from an advertiser can self-update when the
  // advertiser changes.
  // ============================================================

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS mailing_contacts (
      id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      segment         text        NOT NULL DEFAULT 'non-advertiser-atx'
                                   CHECK (segment IN ('manual-newsline','realtor','active-advertiser-atx','active-advertiser-sa','non-advertiser-atx','non-advertiser-sa')),
      first_name      text        NOT NULL,
      last_name       text,
      email           text,
      phone           text,
      company         text,
      title           text,
      license_number  text,
      address         text,
      address_2       text,
      city            text,
      state           text,
      zip             text,
      website         text,
      notes           text,
      tags            jsonb       NOT NULL DEFAULT '[]'::jsonb,
      source          text,
      advertiser_id   integer     REFERENCES advertisers(id) ON DELETE SET NULL,
      unsubscribed_at timestamptz,
      created_at      timestamptz NOT NULL DEFAULT NOW(),
      updated_at      timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  // Migration: rename 'advertiser' segment → 'manual-newsline' on existing
  // databases. Drop the old CHECK (named by Postgres) and add the new one.
  // Update any pre-existing rows first so the new constraint doesn't fail.
  await step(() => sql`UPDATE mailing_contacts SET segment = 'manual-newsline' WHERE segment = 'advertiser'`);
  // Per-publication split: any rows still on the legacy single-publication
  // segments get re-mapped here. 'active-advertiser' rows split by their
  // advertiser's publication (both -> ATX; SA gets its own copy below).
  // 'non-advertiser' rows had no advertiser link and default to the ATX
  // bucket (user can re-tag manually).
  await step(() => sql`
    UPDATE mailing_contacts mc
       SET segment = CASE
         WHEN a.publication = 'san_antonio' THEN 'active-advertiser-sa'
         ELSE 'active-advertiser-atx'
       END
      FROM advertisers a
     WHERE mc.segment = 'active-advertiser'
       AND mc.advertiser_id = a.id
  `);
  // For 'both' advertisers, also insert a SA copy of any row that just
  // landed in -atx via the prior step. Dedupe by lowercased email.
  await step(() => sql`
    INSERT INTO mailing_contacts
      (segment, first_name, last_name, email, phone, company, title, license_number,
       address, address_2, city, state, zip, website, source, advertiser_id, tags, stage)
    SELECT 'active-advertiser-sa', mc.first_name, mc.last_name, mc.email, mc.phone,
           mc.company, mc.title, mc.license_number, mc.address, mc.address_2,
           mc.city, mc.state, mc.zip, mc.website,
           COALESCE(mc.source, '') || ':split-both', mc.advertiser_id, mc.tags, mc.stage
      FROM mailing_contacts mc
      JOIN advertisers a ON a.id = mc.advertiser_id
     WHERE mc.segment = 'active-advertiser-atx'
       AND a.publication = 'both'
       AND mc.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM mailing_contacts mc2
          WHERE mc2.segment = 'active-advertiser-sa'
            AND LOWER(COALESCE(mc2.email, '')) = LOWER(mc.email)
       )
  `);
  // Any remaining 'active-advertiser' rows with no advertiser link (manual
  // imports etc.) default to ATX.
  await step(() => sql`
    UPDATE mailing_contacts SET segment = 'active-advertiser-atx'
     WHERE segment = 'active-advertiser'
  `);
  // 'non-advertiser' -> 'non-advertiser-atx' default.
  await step(() => sql`
    UPDATE mailing_contacts SET segment = 'non-advertiser-atx'
     WHERE segment = 'non-advertiser'
  `);
  await step(() => sql`ALTER TABLE mailing_contacts DROP CONSTRAINT IF EXISTS mailing_contacts_segment_check`);
  await step(() => sql`ALTER TABLE mailing_contacts ADD CONSTRAINT mailing_contacts_segment_check CHECK (segment IN ('manual-newsline','realtor','active-advertiser-atx','active-advertiser-sa','non-advertiser-atx','non-advertiser-sa'))`);

  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mailing_segment       ON mailing_contacts(segment)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mailing_email_lower   ON mailing_contacts(LOWER(email))`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mailing_advertiser    ON mailing_contacts(advertiser_id) WHERE advertiser_id IS NOT NULL`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mailing_company_lower ON mailing_contacts(LOWER(company))`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mailing_name_lower    ON mailing_contacts(LOWER(first_name), LOWER(COALESCE(last_name, '')))`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_mailing_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS mailing_set_updated_at ON mailing_contacts`);
  await step(() => sql`
    CREATE TRIGGER mailing_set_updated_at
      BEFORE UPDATE ON mailing_contacts
      FOR EACH ROW EXECUTE FUNCTION trg_mailing_set_updated_at()
  `);

  // ----------------------------------------------------------------
  // Holding-contacts staging columns (ported from PressBook CRM).
  // `stage` = 'holding'  → staging area awaiting address/email verify
  //         = 'mailing'  → active mailing list (default)
  // Address/email statuses follow PressBook's 'Pending' / 'Valid' /
  // 'Invalid' tri-state. external_id lets sync runs idempotently match
  // rows (e.g. UnlockMLS license number).
  // All ALTERs use IF NOT EXISTS so they self-heal on existing DBs.
  // ----------------------------------------------------------------
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS stage             text NOT NULL DEFAULT 'mailing'
        CHECK (stage IN ('holding','mailing'))
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS addr_status       text
        CHECK (addr_status IS NULL OR addr_status IN ('Pending','Valid','Invalid'))
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_status      text
        CHECK (email_status IS NULL OR email_status IN ('Pending','Valid','Invalid'))
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS addr_verified_at  timestamptz
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_verified_at timestamptz
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS promoted_at       timestamptz
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS external_id       text
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS external_source   text
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_mailing_stage         ON mailing_contacts(stage)`);
  await step(() => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mailing_external_id
      ON mailing_contacts(external_source, external_id)
      WHERE external_source IS NOT NULL AND external_id IS NOT NULL
  `);

  // ----------------------------------------------------------------
  // ABOR Members: mobile phone + geocoding columns. Distance fields
  // are pre-computed at geocode time so we can sort/filter cheaply
  // and render "Near ABoR" / "Near Five Points" badges without
  // re-running haversine on every render.
  // ----------------------------------------------------------------
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS mobile_phone           text
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS lat                    double precision
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS lon                    double precision
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS geocoded_at            timestamptz
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS distance_abor_mi       double precision
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS distance_fivepoints_mi double precision
  `);
  // SABOR anchor (Manual Newsline Contacts proximity reference)
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS distance_sabor_mi      double precision
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS addr_usps_normalized   text
  `);
  await step(() => sql`
    CREATE INDEX IF NOT EXISTS idx_mailing_distance_abor
      ON mailing_contacts(distance_abor_mi)
      WHERE distance_abor_mi IS NOT NULL
  `);
  await step(() => sql`
    CREATE INDEX IF NOT EXISTS idx_mailing_distance_sabor
      ON mailing_contacts(distance_sabor_mi)
      WHERE distance_sabor_mi IS NOT NULL
  `);

  // ----------------------------------------------------------------
  // Email verifier signals. Persist the rich result so the UI can
  // render flags (disposable / role / catch-all / suggestion) without
  // re-running the probe. `email_check` holds the full JSON payload.
  // ----------------------------------------------------------------
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_disposable    boolean
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_role          boolean
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_free_provider boolean
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_catch_all     boolean
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_risk          int
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_suggestion    text
  `);
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_check         jsonb
  `);
  // Free-text notes attached to the email/verifier on each contact.
  // Edited from the drawer; also auto-appended to with timestamped
  // verifier outcomes so the user has a running log.
  await step(() => sql`
    ALTER TABLE mailing_contacts
      ADD COLUMN IF NOT EXISTS email_notes         text
  `);

  // ───────────────────────────────────────────────────────────────────
  // verify_jobs — background queue-drain runs.
  //
  // Each row tracks one full or partial sweep of email_status='Pending'
  // contacts (manual kick-off or cron). The UI polls /status?id to show
  // a live progress bar; the worker updates counts after each batch.
  // ───────────────────────────────────────────────────────────────────
  await step(() => sql`
    CREATE TABLE IF NOT EXISTS verify_jobs (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind            text NOT NULL CHECK (kind IN ('manual', 'cron')),
      status          text NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')) DEFAULT 'queued',
      total           integer NOT NULL DEFAULT 0,
      processed       integer NOT NULL DEFAULT 0,
      valid_count     integer NOT NULL DEFAULT 0,
      invalid_count   integer NOT NULL DEFAULT 0,
      pending_count   integer NOT NULL DEFAULT 0,
      last_error      text,
      started_by      text,
      started_at      timestamptz NOT NULL DEFAULT NOW(),
      finished_at     timestamptz,
      updated_at      timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_verify_jobs_status   ON verify_jobs(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_verify_jobs_started  ON verify_jobs(started_at DESC)`);

  // ============================================================
  // Phase 2 (Pressbook parity) — 20260531 migration
  // agreements: Pressbook columns + renewal_reminders table.
  // Idempotent: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
  // ============================================================
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS address               text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS city                  text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS state                 text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS zip                   text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS discount_cents            int`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS ad_premium_cents          int`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS total_monthly_rate_cents  int`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS page_position         text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS ad_timing_months      jsonb`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS bill_to               text DEFAULT 'Advertiser'`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS billing_contact_name  text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS billing_contact_phone text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS card_type             text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cardholder_name       text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS card_number_last4     text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS card_expiration       text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS cardholder_address    text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS signer_name           text`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS terms_accepted        boolean`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS terms_accepted_at     timestamptz`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS attachments           jsonb DEFAULT '{"files":[]}'::jsonb`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS is_renewal            boolean DEFAULT false`);
  await step(() => sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS renewed_from_id       uuid REFERENCES agreements(id)`);
  await step(() => sql`
    CREATE TABLE IF NOT EXISTS renewal_reminders (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agreement_id     uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
      company_name     text,
      rep_name         text,
      email            text,
      ad_size          text,
      frequency        text,
      ad_rate_cents    int,
      exp_date         date,
      remind_date      date,
      status           text NOT NULL DEFAULT 'Pending'
                         CHECK (status IN ('Pending','Completed','Dismissed')),
      note             text,
      triggered_by     text,
      created_at       timestamptz NOT NULL DEFAULT now()
    )
  `);

  // ============================================================
  // Session 19 — Advertiser locations + staff.
  // Multi-location advertisers (e.g. M/I Homes) need to list each
  // office and assign staff members to a specific location.
  // ============================================================
  await step(() => sql`
    CREATE TABLE IF NOT EXISTS advertiser_locations (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id integer NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
      label         text,
      address       text,
      address_2     text,
      city          text,
      state         text,
      zip           text,
      phone         text,
      email         text,
      hours         text,
      is_primary    boolean NOT NULL DEFAULT false,
      sort_order    integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertiser_locations_advertiser ON advertiser_locations(advertiser_id)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertiser_locations_primary ON advertiser_locations(advertiser_id) WHERE is_primary = true`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_advertiser_locations_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS advertiser_locations_set_updated_at ON advertiser_locations`);
  await step(() => sql`
    CREATE TRIGGER advertiser_locations_set_updated_at
      BEFORE UPDATE ON advertiser_locations
      FOR EACH ROW EXECUTE FUNCTION trg_advertiser_locations_set_updated_at()
  `);

  await step(() => sql`
    CREATE TABLE IF NOT EXISTS advertiser_staff (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_id  integer NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
      name           text NOT NULL,
      title          text,
      email          text,
      phone          text,
      photo_url      text,
      sort_order     integer NOT NULL DEFAULT 0,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertiser_staff_advertiser ON advertiser_staff(advertiser_id)`);

  // Many-to-many join: a staff member can belong to multiple locations.
  await step(() => sql`
    CREATE TABLE IF NOT EXISTS advertiser_staff_locations (
      staff_id    uuid NOT NULL REFERENCES advertiser_staff(id) ON DELETE CASCADE,
      location_id uuid NOT NULL REFERENCES advertiser_locations(id) ON DELETE CASCADE,
      created_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (staff_id, location_id)
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_advertiser_staff_locations_location ON advertiser_staff_locations(location_id)`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_advertiser_staff_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS advertiser_staff_set_updated_at ON advertiser_staff`);
  await step(() => sql`
    CREATE TRIGGER advertiser_staff_set_updated_at
      BEFORE UPDATE ON advertiser_staff
      FOR EACH ROW EXECUTE FUNCTION trg_advertiser_staff_set_updated_at()
  `);

  // ── ad_inquiries ────────────────────────────────────────────────────
  // Persistent funnel record for every /api/inquire submission. Prior
  // versions of /api/inquire only emailed the ads team; rows here are the
  // durable source of truth so the admin inbox, pipeline, and conversion
  // reporting all have something to read.
  //
  // `channel`  : 'print' | 'digital' | 'email' (matches lib/ad-channels)
  // `slot_slug`: digital slot slug OR package id ('brand6', 'eblast2', etc.)
  // `status`   : new / replied / quoted / won / lost / spam
  // `assignee` : email of the admin who claimed the inquiry
  // `takeover` : when true, the auto-redirect to self-serve checkout is
  //              suppressed; admin is handling this lead manually.
  await step(() => sql`
    CREATE TABLE IF NOT EXISTS ad_inquiries (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      channel         text NOT NULL DEFAULT 'digital',
      slot_slug       text,
      slot_label      text,
      publication     text,
      package_id      text,
      name            text NOT NULL,
      email           text NOT NULL,
      phone           text,
      company         text,
      message         text NOT NULL,
      source_url      text,
      ip              text,
      user_agent      text,
      status          text NOT NULL DEFAULT 'new',
      assignee        text,
      takeover        boolean NOT NULL DEFAULT FALSE,
      notes           text,
      advertiser_id   integer REFERENCES advertisers(id) ON DELETE SET NULL,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      replied_at      timestamptz,
      converted_at    timestamptz,
      lost_at         timestamptz
    )
  `);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_inquiries_channel    ON ad_inquiries(channel)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_inquiries_status     ON ad_inquiries(status)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_inquiries_email      ON ad_inquiries(lower(email))`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_inquiries_created_at ON ad_inquiries(created_at DESC)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_inquiries_advertiser ON ad_inquiries(advertiser_id)`);

  await step(() => sql`
    CREATE OR REPLACE FUNCTION trg_ad_inquiries_set_updated_at()
    RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);
  await step(() => sql`DROP TRIGGER IF EXISTS ad_inquiries_set_updated_at ON ad_inquiries`);
  await step(() => sql`
    CREATE TRIGGER ad_inquiries_set_updated_at
      BEFORE UPDATE ON ad_inquiries
      FOR EACH ROW EXECUTE FUNCTION trg_ad_inquiries_set_updated_at()
  `);

  // ── channel tag on existing tables ──────────────────────────────────
  // Tag every downstream row with the same enum so admin views and
  // reporting can join inquiries → agreements → campaigns by channel.
  // Defaults to 'digital' to preserve historical rows (every existing
  // self-serve booking was digital).
  await step(() => sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS channel    text NOT NULL DEFAULT 'digital'`);
  await step(() => sql`ALTER TABLE agreements   ADD COLUMN IF NOT EXISTS channel    text NOT NULL DEFAULT 'digital'`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_ad_campaigns_channel ON ad_campaigns(channel)`);
  await step(() => sql`CREATE INDEX IF NOT EXISTS idx_agreements_channel    ON agreements(channel)`);
}
