// app/api/admin/migrate-portal/route.ts
//
// Step 5 migration — Client portal: magic links, files, forms, form assignments.
// Idempotent: every statement is IF NOT EXISTS / ON CONFLICT.
// Tracked in schema_migrations.

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIGRATION_NAME = '2026_05_30__create_portal';

export const POST = withAdminTracking(async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sql = getSql();

    // schema_migrations table itself (no-op if already exists)
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT NOW()
      )
    `;

    // Short-circuit if already applied
    const existing = await sql`SELECT name FROM schema_migrations WHERE name = ${MIGRATION_NAME}`;
    if (existing.length > 0) {
      return NextResponse.json({ ok: true, skipped: true, name: MIGRATION_NAME });
    }

    // ── portal_magic_links ────────────────────────────────────
    // One row per emailed link. Token is hashed (SHA-256) in DB.
    // link_expires_at   = how long the unconsumed link is valid (single-use)
    // session_expires_at = set on consume, controls portal session lifetime (4hr)
    await sql`
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
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_portal_magic_links_advertiser ON portal_magic_links(advertiser_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_portal_magic_links_session    ON portal_magic_links(session_expires_at) WHERE session_expires_at IS NOT NULL`;

    // ── portal_files ──────────────────────────────────────────
    // Advertiser-scoped file/document handoff. Storage URL points to S3/Blob.
    await sql`
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
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_portal_files_advertiser ON portal_files(advertiser_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_portal_files_agreement  ON portal_files(agreement_id) WHERE agreement_id IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_portal_files_invoice    ON portal_files(invoice_id) WHERE invoice_id IS NOT NULL`;

    // ── portal_forms ─────────────────────────────────────────
    // Reusable form definitions. `schema jsonb` is a small descriptor:
    //   { fields: [{ key, label, type, required, options? }] }
    await sql`
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
    `;

    // ── portal_form_assignments ──────────────────────────────
    // An assignment of a form to a specific advertiser. Stores answers.
    await sql`
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
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_portal_form_assignments_advertiser ON portal_form_assignments(advertiser_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_portal_form_assignments_form       ON portal_form_assignments(form_id)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_portal_form_assignment_pair
              ON portal_form_assignments(form_id, advertiser_id)
              WHERE submitted_at IS NULL`;

    // Seed a default "Profile update" form so the UI has something to show.
    await sql`
      INSERT INTO portal_forms (slug, title, description, schema)
      VALUES (
        'profile-update',
        'Update your profile',
        'Confirm your contact info and preferred publication.',
        ${JSON.stringify({
          fields: [
            { key: 'company', label: 'Company', type: 'text', required: true },
            { key: 'phone',   label: 'Phone',   type: 'tel',  required: false },
            { key: 'website', label: 'Website', type: 'url',  required: false },
            { key: 'preferred_publication', label: 'Preferred publication', type: 'select',
              required: false, options: ['austin', 'san_antonio', 'both'] },
          ],
        })}::jsonb
      )
      ON CONFLICT (slug) DO NOTHING
    `;

    await sql`INSERT INTO schema_migrations (name) VALUES (${MIGRATION_NAME})`;
    return NextResponse.json({ ok: true, name: MIGRATION_NAME });
  } catch (err) {
    return NextResponse.json(
      { error: 'migration failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 }
    );
  }
});
