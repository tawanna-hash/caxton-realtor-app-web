// app/api/admin/import-pressbook-agreements/route.ts
//
// One-shot importer that pulls agreements + invoices from the
// PressBook CRM (https://pressbook-crm.vercel.app) into Caxton's
// `agreements` + `invoices` tables.
//
// Modes:
//   • GET  ?preview=1                                 → dry-run, returns
//                                                       mapping report
//                                                       without writing
//   • POST                                             → applies the
//                                                       import (idempotent
//                                                       via legacy ids)
//
// Auth: getCurrentAdmin() — same as the rest of the migrate-* routes.
//
// Environment:
//   PRESSBOOK_BASE_URL    — defaults to https://pressbook-crm.vercel.app
//   PRESSBOOK_CRON_SECRET — bearer token forwarded to Pressbook's
//                           /api/admin/export-* endpoints
//
// Idempotency: requires `legacy_pressbook_id uuid UNIQUE` on both
// `agreements` and `invoices`. ensureLegacyColumns() adds them on
// first run.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  AGREEMENT_STATUS_VALUES,
  AGREEMENT_TYPE_VALUES,
  PAYMENT_MODE_VALUES,
  type AgreementStatus,
  type PaymentMode,
} from '@/lib/agreements';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ── Pressbook export row shapes ─────────────────────────────────
type PbAgreement = {
  id: string;
  org_id: string;
  contact_id: string | null;
  type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  amount: number | null;
  ad_rate: number | null;
  ad_timing: { months?: string[]; years?: number } | null;
  ad_size: string | null;
  frequency: string | null;
  company_name: string | null;
  rep_name: string | null;
  advertiser_email: string | null;
  advertiser_phone: string | null;
  advertiser_address: string | null;
  sign_date: string | null;
  exp_date: string | null;
  renewal_notice_date: string | null;
  signed_at: string | null;
  signed_document: string | null;
  sent_to_email: string | null;
  is_uploaded: boolean | null;
  billing_name: string | null;
  billing_email: string | null;
  payment_mode: string | null;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_link_url: string | null;
  paid_at: string | null;
  audit_log: unknown;
  eblast_packages: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // contact snapshot
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_office_phone: string | null;
  contact_company: string | null;
  contact_address: string | null;
  contact_address_2: string | null;
  contact_city: string | null;
  contact_state: string | null;
  contact_zip: string | null;
  attachments: Array<{ data_url: string | null; filename: string }> | null;
};

type PbInvoice = {
  id: string;
  org_id: string;
  agreement_id: string | null;
  contact_id: string;
  amount: number;
  status: string;
  stripe_invoice_id: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_company: string | null;
  contact_address: string | null;
  contact_address_2: string | null;
  contact_city: string | null;
  contact_state: string | null;
  contact_zip: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function pbBaseUrl(): string {
  return process.env.PRESSBOOK_BASE_URL?.replace(/\/$/, '') ??
         'https://pressbook-crm.vercel.app';
}

async function fetchPressbookJson<T>(path: string): Promise<T> {
  const secret = process.env.PRESSBOOK_CRON_SECRET;
  if (!secret) throw new Error('PRESSBOOK_CRON_SECRET env var is not set');
  const url = `${pbBaseUrl()}${path}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`pressbook ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Add `legacy_pressbook_id` columns + unique indexes if missing. */
async function ensureLegacyColumns(): Promise<void> {
  const sql = getSql();
  await sql`
    ALTER TABLE agreements
      ADD COLUMN IF NOT EXISTS legacy_pressbook_id uuid
  `;
  await sql`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS legacy_pressbook_id uuid
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_agreements_legacy_pressbook
      ON agreements(legacy_pressbook_id)
      WHERE legacy_pressbook_id IS NOT NULL
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_legacy_pressbook
      ON invoices(legacy_pressbook_id)
      WHERE legacy_pressbook_id IS NOT NULL
  `;
}

/** Normalize a Pressbook status to one Caxton accepts. */
function mapStatus(s: string | null | undefined): AgreementStatus {
  const v = String(s ?? '').toLowerCase();
  return AGREEMENT_STATUS_VALUES.has(v as AgreementStatus)
    ? (v as AgreementStatus)
    : 'draft';
}

function mapType(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = String(s).toLowerCase().replace(/\s+/g, '_');
  return AGREEMENT_TYPE_VALUES.has(v as never) ? v : 'other';
}

function mapPaymentMode(s: string | null | undefined): PaymentMode | null {
  if (!s) return null;
  const v = String(s).toLowerCase();
  return PAYMENT_MODE_VALUES.has(v as PaymentMode) ? (v as PaymentMode) : null;
}

function mapInvoiceStatus(s: string | null | undefined): string {
  const v = String(s ?? '').toLowerCase();
  return ['draft', 'sent', 'paid', 'overdue', 'void'].includes(v) ? v : 'draft';
}

/**
 * Build an advertiser-id lookup keyed by lowercase email and lowercase
 * company name, in that order of preference.
 */
async function buildAdvertiserLookup(): Promise<{
  byEmail: Map<string, number>;
  byCompany: Map<string, number>;
}> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, company, contact_email
    FROM advertisers
  ` as unknown as Array<{
    id: number; name: string;
    company: string | null; contact_email: string | null;
  }>;
  const byEmail = new Map<string, number>();
  const byCompany = new Map<string, number>();
  for (const r of rows) {
    if (r.contact_email) byEmail.set(r.contact_email.toLowerCase().trim(), r.id);
    if (r.company)       byCompany.set(r.company.toLowerCase().trim(), r.id);
    if (r.name)          byCompany.set(r.name.toLowerCase().trim(), r.id);
  }
  return { byEmail, byCompany };
}

function pickAdvertiserId(
  pb: { advertiser_email: string | null;
        contact_email: string | null;
        company_name: string | null;
        contact_company: string | null },
  lookup: { byEmail: Map<string, number>; byCompany: Map<string, number> },
): number | null {
  const emails = [pb.advertiser_email, pb.contact_email].filter(Boolean) as string[];
  for (const e of emails) {
    const hit = lookup.byEmail.get(e.toLowerCase().trim());
    if (hit) return hit;
  }
  const companies = [pb.company_name, pb.contact_company].filter(Boolean) as string[];
  for (const c of companies) {
    const hit = lookup.byCompany.get(c.toLowerCase().trim());
    if (hit) return hit;
  }
  return null;
}

function firstAttachmentUrl(a: PbAgreement): string | null {
  if (a.signed_document) return a.signed_document;
  const list = Array.isArray(a.attachments) ? a.attachments : [];
  for (const att of list) {
    if (att?.data_url) return att.data_url;
  }
  return null;
}

function composeAddress(pb: PbAgreement): string | null {
  if (pb.advertiser_address) return pb.advertiser_address;
  const parts = [
    pb.contact_address, pb.contact_address_2,
    pb.contact_city, pb.contact_state, pb.contact_zip,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function dateOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  // Pressbook stores TIMESTAMP; Caxton agreements has DATE columns for
  // start_date/end_date/sign_date/exp_date/renewal_notice_date. Strip
  // the time portion. signed_at + paid_at on Caxton are timestamptz so
  // leave full ISO for those (callers pass the right field).
  return v.slice(0, 10);
}

// ── Mapping reports ──────────────────────────────────────────────
type AgreementReport = {
  pressbook_id: string;
  status: AgreementStatus;
  advertiser_match: 'matched-by-email' | 'matched-by-company' | 'unmatched';
  advertiser_id: number | null;
  company: string | null;
  email: string | null;
  amount_cents: number | null;
};

type InvoiceReport = {
  pressbook_id: string;
  status: string;
  advertiser_id: number | null;
  advertiser_match: 'matched-by-email' | 'matched-by-company' | 'unmatched';
  amount_cents: number;
  agreement_pressbook_id: string | null;
};

// ── Core ─────────────────────────────────────────────────────────
async function runImport(opts: { preview: boolean }) {
  await ensureSchema();
  await ensureLegacyColumns();

  const { agreements: pbAgreements } = await fetchPressbookJson<{
    agreements: PbAgreement[];
  }>('/api/admin/export-agreements');

  const { invoices: pbInvoices } = await fetchPressbookJson<{
    invoices: PbInvoice[];
  }>('/api/admin/export-invoices');

  const lookup = await buildAdvertiserLookup();
  const sql = getSql();

  // Build agreement reports + an id map (pressbook uuid → caxton uuid)
  const agReports: AgreementReport[] = [];
  const agIdMap = new Map<string, string>(); // pressbook id → caxton id

  // Preload existing caxton agreements that already carry a
  // legacy_pressbook_id so re-runs reuse rather than insert.
  const existingAg = (await sql`
    SELECT id, legacy_pressbook_id FROM agreements
    WHERE legacy_pressbook_id IS NOT NULL
  `) as unknown as Array<{ id: string; legacy_pressbook_id: string }>;
  for (const r of existingAg) agIdMap.set(r.legacy_pressbook_id, r.id);

  let agInserted = 0, agSkipped = 0;

  for (const pb of pbAgreements) {
    const advertiserId = pickAdvertiserId(pb, lookup);
    const matchKind: AgreementReport['advertiser_match'] =
      advertiserId == null
        ? 'unmatched'
        : (pb.advertiser_email || pb.contact_email) &&
          lookup.byEmail.has(((pb.advertiser_email || pb.contact_email) ?? '').toLowerCase().trim())
            ? 'matched-by-email'
            : 'matched-by-company';

    agReports.push({
      pressbook_id: pb.id,
      status: mapStatus(pb.status),
      advertiser_match: matchKind,
      advertiser_id: advertiserId,
      company: pb.company_name ?? pb.contact_company ?? null,
      email: pb.advertiser_email ?? pb.contact_email ?? null,
      amount_cents: pb.amount ?? pb.ad_rate ?? null,
    });

    if (opts.preview) continue;

    // Skip if already imported
    if (agIdMap.has(pb.id)) {
      agSkipped++;
      continue;
    }

    const status = mapStatus(pb.status);
    const type   = mapType(pb.type);
    const pmode  = mapPaymentMode(pb.payment_mode);
    const auditLog = Array.isArray(pb.audit_log) ? pb.audit_log : [];
    const eblastPkgs = Array.isArray(pb.eblast_packages) ? pb.eblast_packages : [];

    const inserted = await sql`
      INSERT INTO agreements (
        legacy_pressbook_id,
        advertiser_id, company_name, rep_name, advertiser_email,
        advertiser_phone, advertiser_address,
        type, status, start_date, end_date,
        ad_size, frequency, ad_rate_cents, ad_timing, eblast_packages,
        amount_cents,
        sign_date, exp_date, renewal_notice_date,
        signed_at, signed_document, sent_to_email, is_uploaded,
        billing_name, billing_email, payment_mode,
        stripe_customer_id, stripe_invoice_id, stripe_payment_intent_id,
        stripe_payment_link_url, paid_at,
        notes, audit_log, created_by, created_at, updated_at
      ) VALUES (
        ${pb.id},
        ${advertiserId},
        ${pb.company_name ?? pb.contact_company},
        ${pb.rep_name ?? ([pb.contact_first_name, pb.contact_last_name].filter(Boolean).join(' ') || null)},
        ${pb.advertiser_email ?? pb.contact_email},
        ${pb.advertiser_phone ?? pb.contact_phone},
        ${composeAddress(pb)},
        ${type},
        ${status},
        ${dateOrNull(pb.start_date)},
        ${dateOrNull(pb.end_date)},
        ${pb.ad_size},
        ${pb.frequency},
        ${pb.ad_rate ?? null},
        ${pb.ad_timing ? JSON.stringify(pb.ad_timing) : null}::jsonb,
        ${JSON.stringify(eblastPkgs)}::jsonb,
        ${pb.amount ?? pb.ad_rate ?? null},
        ${dateOrNull(pb.sign_date)},
        ${dateOrNull(pb.exp_date)},
        ${dateOrNull(pb.renewal_notice_date)},
        ${pb.signed_at},
        ${firstAttachmentUrl(pb)},
        ${pb.sent_to_email},
        ${Boolean(pb.is_uploaded)},
        ${pb.billing_name},
        ${pb.billing_email},
        ${pmode},
        ${pb.stripe_customer_id},
        ${pb.stripe_invoice_id},
        ${pb.stripe_payment_intent_id},
        ${pb.stripe_payment_link_url},
        ${pb.paid_at},
        ${pb.notes},
        ${JSON.stringify(auditLog)}::jsonb,
        ${'pressbook-migration'},
        ${pb.created_at},
        ${pb.updated_at}
      )
      ON CONFLICT (legacy_pressbook_id) WHERE legacy_pressbook_id IS NOT NULL
      DO NOTHING
      RETURNING id
    `;
    if (inserted[0]?.id) {
      agIdMap.set(pb.id, String(inserted[0].id));
      agInserted++;
    } else {
      agSkipped++;
    }
  }

  // Invoices
  const invReports: InvoiceReport[] = [];
  let invInserted = 0, invSkipped = 0;

  const existingInv = (await sql`
    SELECT legacy_pressbook_id FROM invoices
    WHERE legacy_pressbook_id IS NOT NULL
  `) as unknown as Array<{ legacy_pressbook_id: string }>;
  const importedInv = new Set(existingInv.map((r) => r.legacy_pressbook_id));

  for (const pb of pbInvoices) {
    // Reuse the same advertiser lookup logic via a synthetic shape
    const advertiserId = pickAdvertiserId(
      {
        advertiser_email: pb.contact_email,
        contact_email: pb.contact_email,
        company_name: pb.contact_company,
        contact_company: pb.contact_company,
      },
      lookup,
    );
    const matchKind: InvoiceReport['advertiser_match'] =
      advertiserId == null
        ? 'unmatched'
        : pb.contact_email && lookup.byEmail.has(pb.contact_email.toLowerCase().trim())
          ? 'matched-by-email'
          : 'matched-by-company';

    invReports.push({
      pressbook_id: pb.id,
      status: mapInvoiceStatus(pb.status),
      advertiser_id: advertiserId,
      advertiser_match: matchKind,
      amount_cents: pb.amount,
      agreement_pressbook_id: pb.agreement_id,
    });

    if (opts.preview) continue;
    if (importedInv.has(pb.id)) { invSkipped++; continue; }

    // Invoices require advertiser_id (NOT NULL FK); skip unmatched.
    if (advertiserId == null) { invSkipped++; continue; }

    const status = mapInvoiceStatus(pb.status);
    const caxtonAgreementId = pb.agreement_id ? (agIdMap.get(pb.agreement_id) ?? null) : null;

    const inserted = await sql`
      INSERT INTO invoices (
        legacy_pressbook_id,
        advertiser_id, agreement_id,
        amount_cents, tax_cents, status,
        stripe_invoice_id,
        due_date, paid_at,
        bill_to_name, bill_to_email, bill_to_address,
        memo, line_items,
        created_by, created_at, updated_at
      ) VALUES (
        ${pb.id},
        ${advertiserId},
        ${caxtonAgreementId},
        ${pb.amount},
        ${0},
        ${status},
        ${pb.stripe_invoice_id},
        ${dateOrNull(pb.due_date)},
        ${pb.paid_at},
        ${[pb.contact_first_name, pb.contact_last_name].filter(Boolean).join(' ') || null},
        ${pb.contact_email},
        ${[pb.contact_address, pb.contact_address_2, pb.contact_city, pb.contact_state, pb.contact_zip].filter(Boolean).join(', ') || null},
        ${null},
        ${JSON.stringify([])}::jsonb,
        ${'pressbook-migration'},
        ${pb.created_at},
        ${pb.created_at}
      )
      ON CONFLICT (legacy_pressbook_id) WHERE legacy_pressbook_id IS NOT NULL
      DO NOTHING
      RETURNING id
    `;
    if (inserted[0]?.id) invInserted++; else invSkipped++;
  }

  // Summary
  const agByMatch = { matched_by_email: 0, matched_by_company: 0, unmatched: 0 };
  for (const r of agReports) {
    if (r.advertiser_match === 'matched-by-email')   agByMatch.matched_by_email++;
    else if (r.advertiser_match === 'matched-by-company') agByMatch.matched_by_company++;
    else agByMatch.unmatched++;
  }
  const invByMatch = { matched_by_email: 0, matched_by_company: 0, unmatched: 0 };
  for (const r of invReports) {
    if (r.advertiser_match === 'matched-by-email')   invByMatch.matched_by_email++;
    else if (r.advertiser_match === 'matched-by-company') invByMatch.matched_by_company++;
    else invByMatch.unmatched++;
  }

  return {
    mode: opts.preview ? 'preview' : 'applied',
    agreements: {
      total_in_pressbook: pbAgreements.length,
      inserted: agInserted,
      skipped_already_imported: agSkipped,
      advertiser_match_breakdown: agByMatch,
      unmatched_sample: agReports
        .filter((r) => r.advertiser_match === 'unmatched')
        .slice(0, 20),
    },
    invoices: {
      total_in_pressbook: pbInvoices.length,
      inserted: invInserted,
      skipped: invSkipped,
      advertiser_match_breakdown: invByMatch,
      unmatched_sample: invReports
        .filter((r) => r.advertiser_match === 'unmatched')
        .slice(0, 20),
    },
  };
}

// ── Handlers ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const preview = url.searchParams.get('preview') === '1';

  try {
    const report = await runImport({ preview });
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error('[import-pressbook-agreements GET]', errMessage(err));
    return NextResponse.json(
      { ok: false, error: errMessage(err) },
      { status: 500 },
    );
  }
}

export const POST = withAdminTracking(async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const report = await runImport({ preview: false });
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error('[import-pressbook-agreements POST]', errMessage(err));
    return NextResponse.json(
      { ok: false, error: errMessage(err) },
      { status: 500 },
    );
  }
});
