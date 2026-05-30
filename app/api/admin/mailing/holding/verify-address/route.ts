// app/api/admin/mailing/holding/verify-address/route.ts
//
// POST /api/admin/mailing/holding/verify-address
//   Body: { id: string }
//   Runs the row's mailing address through USPS Address API v3, persists
//   the result (Valid / Invalid) and the USPS-normalized one-line
//   address. On Valid, also runs a Census geocode in the background
//   and stores lat/lon + distances to ABoR & Five Points.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  persistAddressVerification,
  persistGeocode,
  type MailingContactRow,
} from '@/lib/mailing';
import {
  verifyAddressUsps,
  formatUspsAddress,
} from '@/lib/usps-verify';
import { geocodeAddress } from '@/lib/geocode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be uuid' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM mailing_contacts WHERE id = ${id} AND stage = 'holding'
    `) as unknown as MailingContactRow[];
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (!row.address) {
      const updated = await persistAddressVerification(id, 'Invalid', null);
      return NextResponse.json({
        ok: true,
        verdict: 'Invalid',
        detail: 'No street address on file.',
        row: updated,
      });
    }

    const result = await verifyAddressUsps({
      streetAddress:    row.address,
      secondaryAddress: row.address_2,
      city:             row.city,
      state:            row.state,
      zip:              row.zip,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'usps error', detail: result.error },
        { status: 502 },
      );
    }

    if (result.status === 'Invalid') {
      const updated = await persistAddressVerification(id, 'Invalid', null);
      return NextResponse.json({
        ok: true,
        verdict: 'Invalid',
        detail: result.detail,
        row: updated,
      });
    }

    // Valid — store normalized address, then geocode for distance calc.
    const normalized = formatUspsAddress(result.normalized);
    let updated = await persistAddressVerification(id, 'Valid', normalized);

    // Geocode using USPS-normalized parts (more reliable than raw input)
    const geo = await geocodeAddress({
      address: result.normalized.streetAddress,
      city:    result.normalized.city,
      state:   result.normalized.state,
      zip:     result.normalized.zip5,
    });
    if (geo.ok && geo.lat !== undefined && geo.lon !== undefined) {
      updated = await persistGeocode(
        id,
        geo.lat,
        geo.lon,
        geo.distAbor ?? 0,
        geo.distFivePoints ?? 0,
      );
    }

    return NextResponse.json({
      ok:        true,
      verdict:   'Valid',
      normalized,
      geocoded:  geo.ok,
      distance_abor_mi:       geo.distAbor ?? null,
      distance_fivepoints_mi: geo.distFivePoints ?? null,
      row: updated,
    });
  } catch (err) {
    console.error('[admin/mailing/holding/verify-address]', errMessage(err));
    return NextResponse.json({ error: 'verify failed', detail: errMessage(err) }, { status: 500 });
  }
}
