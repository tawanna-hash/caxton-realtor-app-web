// app/api/admin/mailing/refresh-addresses/route.ts
//
// POST — Walks every row in the given mailing segment and fills in
// missing address fields from the linked advertiser's locations
// (preferring the staff member's assigned location for staff rows).
//
// Body: { segment: MailingSegment, force?: boolean }
//   - force=false (default): only fills NULL/empty cells, preserving
//     admin edits.
//   - force=true: overwrites every row with the canonical
//     advertiser-location address.
//
// Used by the "Refresh addresses from advertisers" button on the
// Active Advertisers mailing pages so USPS verify has real addresses
// to validate against.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import {
  isMailingSegment,
  refreshMailingAddressesForSegment,
} from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const segment = (body as { segment?: unknown })?.segment;
  const force = (body as { force?: unknown })?.force === true;

  if (!isMailingSegment(segment)) {
    return NextResponse.json(
      { error: 'invalid or missing segment' },
      { status: 400 },
    );
  }

  try {
    await ensureSchema();
    const result = await refreshMailingAddressesForSegment(segment, { force });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: errMessage(err) },
      { status: 500 },
    );
  }
}
