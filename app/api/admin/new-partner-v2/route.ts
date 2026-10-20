// app/api/admin/new-partner-v2/route.ts
//
// New-partner agreements (Beta). GET — unsigned, non-renewal agreements and
// their state in the 3-screen flow.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { listNewPartnerCandidates } from '@/lib/new-partner-v2/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    return NextResponse.json({ candidates: await listNewPartnerCandidates(getSql()) });
  } catch (err) {
    return NextResponse.json({ error: 'list failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
