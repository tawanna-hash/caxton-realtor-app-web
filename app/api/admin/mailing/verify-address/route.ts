// app/api/admin/mailing/verify-address/route.ts
//
// POST /api/admin/mailing/verify-address
//   Body: { id: string }
//   Stage-agnostic USPS Address API v3 verifier for the mailing list.
//   Mirrors app/api/admin/mailing/holding/verify-address/route.ts but
//   operates on rows in stage='mailing' (e.g. the Manual Newsline San Antonio
//   Contacts segment). Persists Valid/Invalid + USPS-normalized address
//   and runs a Census geocode in the same request when Valid.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  persistAddressVerificationAnyStage,
  persistGeocode,
  persistUspsCanonicalAddressAnyStage,
  type MailingContactRow,
} from '@/lib/mailing';
import {
  verifyAddressUsps,
  formatUspsAddress,
} from '@/lib/usps-verify';
import { geocodeAddress } from '@/lib/geocode';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { idParamSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  const { id } = await parseJson(req, idParamSchema);

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM mailing_contacts WHERE id = ${id}
  `) as unknown as MailingContactRow[];
  const row = rows[0];
  if (!row) throw new ApiError(404, 'not found');

  if (!row.address) {
    const updated = await persistAddressVerificationAnyStage(id, 'Invalid', null);
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
    const updated = await persistAddressVerificationAnyStage(id, 'Invalid', null);
    return NextResponse.json({
      ok: true,
      verdict: 'Invalid',
      detail: result.detail,
      row: updated,
    });
  }

  // Valid — overwrite address fields with USPS-canonical form
  const normalized = formatUspsAddress(result.normalized);
  let updated = await persistUspsCanonicalAddressAnyStage(
    id,
    result.normalized,
    normalized,
  );

  // Geocode using USPS-normalized parts
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
