import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  persistAddressVerificationAnyStage,
  persistGeocode,
  persistUspsCanonicalAddressAnyStage,
  type MailingContactRow,
} from '@/lib/mailing';
import { verifyAddressUsps, formatUspsAddress } from '@/lib/usps-verify';
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

  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM mailing_contacts
    WHERE id = ${id}
  `) as unknown as MailingContactRow[];

  const row = rows[0];

  if (!row) {
    throw new ApiError(404, 'not found');
  }

  if (!row.address?.trim()) {
    const updated = await persistAddressVerificationAnyStage(id, 'Invalid', null);

    return NextResponse.json({
      ok: true,
      verdict: 'Invalid',
      detail: 'No street address on file.',
      row: updated,
    });
  }

  const result = await verifyAddressUsps({
    streetAddress: row.address,
    secondaryAddress: row.address_2,
    city: row.city,
    state: row.state,
    zip: row.zip,
  });

  if (!result.ok) {
    const safeError = result.error.slice(0, 500);

    const failedRows = (await sql`
      UPDATE mailing_contacts
      SET
        addr_status = 'Error',
        addr_verified_at = NOW(),
        addr_usps_normalized = NULL,
        addr_verification_error = ${safeError},
        addr_verification_raw = ${JSON.stringify({
          source: 'usps-address-api-v3',
          error: safeError,
          at: new Date().toISOString(),
        })}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `) as unknown as MailingContactRow[];

    return NextResponse.json(
      {
        ok: false,
        verdict: 'Error',
        code: 'USPS_UPSTREAM_ERROR',
        detail: safeError,
        row: failedRows[0] ?? null,
      },
      { status: 502 },
    );
  }

  if (result.status === 'Invalid') {
    const updated = await persistAddressVerificationAnyStage(id, 'Invalid', null);

    await sql`
      UPDATE mailing_contacts
      SET
        addr_verification_error = NULL,
        addr_verification_raw = NULL,
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({
      ok: true,
      verdict: 'Invalid',
      detail: result.detail,
      row: updated,
    });
  }

  const normalized = formatUspsAddress(result.normalized);

  let updated = await persistUspsCanonicalAddressAnyStage(
    id,
    result.normalized,
    normalized,
  );

  await sql`
    UPDATE mailing_contacts
    SET
      addr_verification_error = NULL,
      addr_verification_raw = NULL,
      updated_at = NOW()
    WHERE id = ${id}
  `;

  const geo = await geocodeAddress({
    address: result.normalized.streetAddress,
    city: result.normalized.city,
    state: result.normalized.state,
    zip: result.normalized.zip5,
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
    ok: true,
    verdict: 'Valid',
    normalized,
    geocoded: geo.ok,
    distance_abor_mi: geo.distAbor ?? null,
    distance_fivepoints_mi: geo.distFivePoints ?? null,
    distance_sabor_mi: geo.distSabor ?? null,
    row: updated,
  });
});
