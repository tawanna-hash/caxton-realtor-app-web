// app/api/admin/mailing/holding/refresh-addresses/route.ts
//
// POST — Walk every holding-stage row for an external source (e.g.
// 'ramco-sabor' or 'unlockmls') and fill in missing address fields from
// the matched advertiser. Matches by license_number OR by staff email.
// Admin edits are preserved (only NULL/empty cells get written).
//
// Body: { source: string }
//   - 'ramco-sabor' for SABOR Members page
//   - 'unlockmls'   for ABOR Members (holding) page

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import { refreshHoldingAddressesFromAdvertisers } from '@/lib/server/mailing/advertiser-sync';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

const ALLOWED_SOURCES = new Set(['ramco-sabor', 'unlockmls']);

export const POST = withAdminTracking(async function POST(req: NextRequest) {
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

  const source = (body as { source?: unknown })?.source;
  if (typeof source !== 'string' || !ALLOWED_SOURCES.has(source)) {
    return NextResponse.json(
      { error: 'invalid or missing source (expected ramco-sabor or unlockmls)' },
      { status: 400 },
    );
  }

  try {
    await ensureSchema();
    const result = await refreshHoldingAddressesFromAdvertisers(source);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 });
  }
});
