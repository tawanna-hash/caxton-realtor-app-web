// app/api/admin/mailing/export-near/route.ts
//
// GET /api/admin/mailing/export-near?segment=<MailingSegment>
//   Streams a CSV of every contact in the given mailing segment whose
//   geocoded mailing address sits within 60 miles of the relevant anchor.
//
//   - SABOR segments (manual-newsline, active-advertiser-sa,
//     non-advertiser-sa) measure distance from SABOR HQ. The CSV uses
//     "Distance to SABOR (mi)" as the geo column.
//   - ABoR segments (active-advertiser-atx, non-advertiser-atx, realtor)
//     measure distance from ABoR HQ + Five Points BoR and surface whichever
//     is closer.
//
// Powers the "Within 60 mi" KPI card's export action on the per-segment
// admin pages (/admin/mailing/[segment]).

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import {
  isMailingSegment,
  isSaborSegment,
  slugFromSegment,
  type MailingSegment,
} from '@/lib/server/mailing/segments';

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

interface BaseRow {
  first_name:     string | null;
  last_name:      string | null;
  title:          string | null;
  email:          string | null;
  email_status:   string | null;
  company:        string | null;
  address:        string | null;
  address_2:      string | null;
  city:           string | null;
  state:          string | null;
  zip:            string | null;
  license_number: string | null;
  phone:          string | null;
  mobile_phone:   string | null;
  geocoded_at:    string | null;
}

interface SaborRow extends BaseRow {
  distance_sabor_mi: number | null;
}

interface AborRow extends BaseRow {
  distance_abor_mi:       number | null;
  distance_fivepoints_mi: number | null;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const NEAR_MI = 60;

  const segParam = req.nextUrl.searchParams.get('segment') ?? '';
  if (!isMailingSegment(segParam)) {
    return NextResponse.json(
      { error: 'Invalid or missing segment parameter.' },
      { status: 400 },
    );
  }
  const segment: MailingSegment = segParam;
  const slug = slugFromSegment(segment);
  const ts = new Date().toISOString().slice(0, 10);

  if (isSaborSegment(segment)) {
    const rows = (await sql`
      SELECT
        first_name, last_name, title, email, email_status, company,
        address, address_2, city, state, zip, license_number,
        phone, mobile_phone,
        distance_sabor_mi,
        geocoded_at
      FROM mailing_contacts
      WHERE segment = ${segment}
        AND distance_sabor_mi IS NOT NULL
        AND distance_sabor_mi <= ${NEAR_MI}
      ORDER BY
        distance_sabor_mi ASC,
        last_name ASC NULLS LAST,
        first_name ASC NULLS LAST
    `) as unknown as SaborRow[];

    const headers = [
      'First Name', 'Last Name', 'Title', 'Email', 'Email Status',
      'Company', 'Mailing Address', 'Address 2', 'City', 'State', 'ZIP',
      'TREC License', 'Phone', 'Mobile/Cell',
      'Distance to SABOR (mi)', 'Geocoded At',
    ];

    const lines: string[] = [headers.map(csvField).join(',')];
    for (const r of rows) {
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
        csvField(r.distance_sabor_mi !== null && r.distance_sabor_mi !== undefined ? r.distance_sabor_mi.toFixed(2) : ''),
        csvField(r.geocoded_at),
      ].join(','));
    }
    const body = '\uFEFF' + lines.join('\r\n') + '\r\n';
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mailing-${slug}-within-60mi-${ts}.csv"`,
        'Cache-Control':       'no-store',
      },
    });
  }

  // Austin-area (ABoR + Five Points) export for non-SABOR segments.
  const rows = (await sql`
    SELECT
      first_name, last_name, title, email, email_status, company,
      address, address_2, city, state, zip, license_number,
      phone, mobile_phone,
      distance_abor_mi, distance_fivepoints_mi,
      geocoded_at
    FROM mailing_contacts
    WHERE segment = ${segment}
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
  `) as unknown as AborRow[];

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
  const body = '\uFEFF' + lines.join('\r\n') + '\r\n';
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mailing-${slug}-within-60mi-${ts}.csv"`,
      'Cache-Control':       'no-store',
    },
  });
});
