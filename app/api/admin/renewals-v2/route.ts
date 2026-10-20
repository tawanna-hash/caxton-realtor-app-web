// app/api/admin/renewals-v2/route.ts
//
// Renewals (Beta). GET — agreements due for renewal with their one-tap state.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { listCandidates } from '@/lib/renewals-v2/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 90));
    const candidates = await listCandidates(getSql(), days);
    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json(
      { error: 'list failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
}
