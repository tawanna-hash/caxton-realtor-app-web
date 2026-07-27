// app/api/admin/mailing/holding/verify-address/route.ts
//
// POST /api/admin/mailing/holding/verify-address
//   Body: { id: string }
//   Runs the row's mailing address through USPS Address API v3, persists
//   the result (Valid / Invalid) and the USPS-normalized one-line
//   address. On Valid, also runs a Census geocode in the background
//   and stores lat/lon + distances to ABoR & Five Points.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  persistAddressVerification,
  persistGeocode,
  persistUspsCanonicalAddress,
  type MailingContactRow,
} from '@/lib/mailing';
import {
  verifyAddressUsps,
  formatUspsAddress,
} from '@/lib/usps-verify';
import { geocodeAddress } from '@/lib/geocode';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { idParamSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const { id } = await parseJson(req, idParamSchema);

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM mailing_contacts WHERE id = ${id} AND stage = 'holding'
  `) as unknown as MailingContactRow[];
  const row = rows[0];
  if (!row) throw new ApiError(404, 'not found');

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
    throw new ApiError(502, 'usps error', { detail: result.error });
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

  // Valid — overwrite the row's address fields with the USPS-canonical
  // version (so the drawer + the rest of the app sees the standardized
  // form rather than the user's raw input), then geocode for distance.
  const normalized = formatUspsAddress(result.normalized);
  let updated = await persistUspsCanonicalAddress(
    id,
    result.normalized,
    normalized,
  );

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
      geo.distSabor ?? 0,
    );
  }

  return NextResponse.json({
    ok:        true,
    verdict:   'Valid',
    normalized,
    geocoded:  geo.ok,
    distance_abor_mi:       geo.distAbor ?? null,
    distance_fivepoints_mi: geo.distFivePoints ?? null,
    distance_sabor_mi:      geo.distSabor ?? null,
    row: updated,
  });
});
