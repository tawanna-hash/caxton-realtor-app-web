// app/api/admin/agreements-v2/[id]/route.ts
//
// Agreements (Beta). POST { action: 'create_schedule' } — create the draft
// (paused) recurring schedule for a signed agreement that does not have one.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createDraftScheduleForAgreement } from '@/lib/agreements-v2/recurring-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withAdminTracking(async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional */ }
  if (body.action !== 'create_schedule') return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  try {
    await ensureSchema();
    const res = await createDraftScheduleForAgreement(getSql(), id, admin.email ?? null);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 422 });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: 'failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
