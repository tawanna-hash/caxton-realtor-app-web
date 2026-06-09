// caxton-sabor-mls-v1
// SABOR MLS gate \u2014 license + email verification endpoint.
//
// POST /api/sabor-mls/verify
//   Body (JSON): { license: string, email: string, month?: string }
//
// Looks up the holding/active mailing_contacts row keyed by license_number
// (case-insensitive) with external_source='ramco-sabor', and confirms the
// submitted email matches the on-file email (case-insensitive). On success
// returns 200 with a download_url (the report PDF/landing page) and sets a
// 7-day `sabor_verified` cookie so subsequent reports auto-unlock.
//
// We deliberately accept submissions even if the SABOR sync hasn't populated
// the user's row yet \u2014 in that case we report 404-not-found with a friendly
// message telling them to email support@... and we log the attempt for audit.

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'sabor_verified';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

async function ensureAuditTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS sabor_mls_verify_log (
      id               BIGSERIAL PRIMARY KEY,
      submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      license          TEXT,
      email            TEXT,
      month            TEXT,
      matched          BOOLEAN NOT NULL,
      contact_id       UUID,
      ip               TEXT,
      user_agent       TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sabor_mls_verify_log_license_idx ON sabor_mls_verify_log (license)`;
  await sql`CREATE INDEX IF NOT EXISTS sabor_mls_verify_log_submitted_at_idx ON sabor_mls_verify_log (submitted_at DESC)`;
}

function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

function normalizeLicense(input: string): string {
  return input.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export async function POST(req: Request) {
  let body: { license?: unknown; email?: unknown; month?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid_body', message: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const rawLicense = typeof body.license === 'string' ? body.license : '';
  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const month = typeof body.month === 'string' ? body.month.slice(0, 32) : null;

  const license = normalizeLicense(rawLicense);
  const email = normalizeEmail(rawEmail);

  if (!license || license.length < 4) {
    return NextResponse.json(
      { ok: false, code: 'missing_license', message: 'License number is required.' },
      { status: 400 },
    );
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json(
      { ok: false, code: 'invalid_email', message: 'A valid email is required.' },
      { status: 400 },
    );
  }

  const sql = getSql();
  await ensureAuditTable();

  // Match on normalized license (strip non-alphanum, upper) + email (lower).
  // We're lenient about which `external_source` so members imported from
  // either SABOR or ABoR can verify off the same row.
  const matches = (await sql`
    SELECT id, email, first_name, last_name, license_number, external_source
      FROM mailing_contacts
     WHERE UPPER(REGEXP_REPLACE(COALESCE(license_number, ''), '[^A-Za-z0-9]', '', 'g')) = ${license}
       AND LOWER(COALESCE(email, '')) = ${email}
     LIMIT 1
  `) as unknown as Array<{
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    license_number: string | null;
    external_source: string | null;
  }>;

  const ua = req.headers.get('user-agent');
  const ip = clientIp(req);

  if (matches.length === 0) {
    // Audit the miss but don't leak whether the license vs. email failed.
    await sql`
      INSERT INTO sabor_mls_verify_log (license, email, month, matched, ip, user_agent)
      VALUES (${license}, ${email}, ${month}, FALSE, ${ip}, ${ua})
    `;
    return NextResponse.json(
      {
        ok: false,
        code: 'no_match',
        message:
          'We couldn\u2019t match that license + email to a current SABOR member. ' +
          'Verify both fields exactly as they appear on your SABOR profile, or email support@caxtonpub.com for help.',
      },
      { status: 404 },
    );
  }

  const row = matches[0];
  await sql`
    INSERT INTO sabor_mls_verify_log (license, email, month, matched, contact_id, ip, user_agent)
    VALUES (${license}, ${email}, ${month}, TRUE, ${row.id}, ${ip}, ${ua})
  `;

  // Look up the current report so we can return a download/landing URL.
  let downloadUrl: string | null = null;
  try {
    const reports = (await sql`
      SELECT id, pdf_storage_key, month_label
        FROM sabor_mls_reports
       ORDER BY released_at DESC
       LIMIT 1
    `) as unknown as Array<{
      id: number;
      pdf_storage_key: string | null;
      month_label: string;
    }>;
    if (reports.length > 0) {
      const rep = reports[0];
      // If we store a direct PDF key, that's the download. Otherwise route
      // to an internal viewer page that the SaborReportCard can render.
      downloadUrl = rep.pdf_storage_key
        ? `/api/sabor-mls/download/${rep.id}`
        : `/sabor-mls/report/${rep.id}`;
    }
  } catch {
    // table may not exist yet \u2014 swallow and fall through to null
  }

  const res = NextResponse.json({
    ok: true,
    matched: true,
    contact: {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
    },
    download_url: downloadUrl,
  });
  res.cookies.set(COOKIE_NAME, row.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
  return res;
}
