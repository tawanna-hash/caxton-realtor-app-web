// app/api/admin/mailing/holding/export-near/route.ts
//
// GET /api/admin/mailing/holding/export-near
//   Streams a CSV of every ABOR Member whose geocoded mailing address
//   sits within 60 miles of either anchor (ABoR HQ or Five Points BoR).
//   Powers the "Within 60 mi" KPI card's export action.
//
// CSV columns:
//   First Name, Last Name, Title, Email, Email Status, Company,
//   Mailing Address, Address 2, City, State, ZIP, TREC License,
//   Phone, Mobile/Cell, Distance to ABoR (mi), Distance to Five Points (mi),
//   Nearest Anchor, Geocoded At

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * CSV-escape a field per RFC 4180. We wrap in double-quotes whenever
 * the value contains a comma, quote, newline, or leading/trailing
 * whitespace, and double any embedded quotes.
 */
function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s === '') return '';
  const needsQuote = /[",\r\n]/.test(s) || /^\s|\s$/.test(s);
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

interface NearRow {
  first_name:             string | null;
  last_name:              string | null;
  title:                  string | null;
  email:                  string | null;
  email_status:           string | null;
  company:                string | null;
  address:                string | null;
  address_2:              string | null;
  city:                   string | null;
  state:                  string | null;
  zip:                    string | null;
  license_number:         string | null;
  phone:                  string | null;
  mobile_phone:           string | null;
  distance_abor_mi:       number | null;
  distance_fivepoints_mi: number | null;
  geocoded_at:            string | null;
}

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const NEAR_MI = 60;
  const rows = (await sql`
    SELECT
      first_name, last_name, title, email, email_status, company,
      address, address_2, city, state, zip, license_number,
      phone, mobile_phone,
      distance_abor_mi, distance_fivepoints_mi,
      geocoded_at
    FROM mailing_contacts
    WHERE stage = 'holding'
      AND (
        (distance_abor_mi       IS NOT NULL AND distance_abor_mi       <= ${NEAR_MI})
        OR
        (distance_fivepoints_mi IS NOT NULL AND distance_fivepoints_mi <= ${NEAR_MI})
      )
    ORDER BY
      LEAST(
        COALESCE(distance_abor_mi,       1e9),
        COALESCE(distance_fivepoints_mi, 1e9)
      ) ASC,
      last_name ASC NULLS LAST,
      first_name ASC NULLS LAST
  `) as unknown as NearRow[];

  const headers = [
    'First Name', 'Last Name', 'Title', 'Email', 'Email Status',
    'Company', 'Mailing Address', 'Address 2', 'City', 'State', 'ZIP',
    'TREC License', 'Phone', 'Mobile/Cell',
    'Distance to ABoR (mi)', 'Distance to Five Points (mi)',
    'Nearest Anchor', 'Geocoded At',
  ];

  const lines: string[] = [headers.map(csvField).join(',')];
  for (const r of rows) {
    const dA = r.distance_abor_mi;
    const dF = r.distance_fivepoints_mi;
    // Surface whichever anchor is closer so the user can sort/segment.
    const nearest =
      dA !== null && dF !== null ? (dA <= dF ? 'ABoR' : 'Five Points') :
      dA !== null                  ? 'ABoR' :
      dF !== null                  ? 'Five Points' :
                                     '';
    lines.push([
      csvField(r.first_name),
      csvField(r.last_name),
      csvField(r.title),
      csvField(r.email),
      csvField(r.email_status),
      csvField(r.company),
      csvField(r.address),
      csvField(r.address_2),
      csvField(r.city),
      csvField(r.state),
      csvField(r.zip),
      csvField(r.license_number),
      csvField(r.phone),
      csvField(r.mobile_phone),
      csvField(dA !== null && dA !== undefined ? dA.toFixed(2) : ''),
      csvField(dF !== null && dF !== undefined ? dF.toFixed(2) : ''),
      csvField(nearest),
      csvField(r.geocoded_at),
    ].join(','));
  }
  // Excel-friendly UTF-8 BOM so accented characters render correctly.
  const body = '\uFEFF' + lines.join('\r\n') + '\r\n';

  const ts = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="abor-members-within-60mi-${ts}.csv"`,
      'Cache-Control':       'no-store',
    },
  });
});
