// app/api/admin/renewals-v2/[id]/route.ts
//
// Renewals (Beta). POST { action: 'preview' | 'send', rate_lock?: boolean, to?: string }
//   id = the EXPIRING agreement being renewed.
//   preview — create/reuse the renewal draft and return the partner link.
//             Sends nothing.
//   send    — create/reuse the draft and email the one-tap link.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureRenewalDraft, renewalLink, sendRenewalEmail } from '@/lib/renewals-v2/service';

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
  const action = body.action === 'send' ? 'send' : 'preview';

  try {
    await ensureSchema();
    const sql = getSql();
    const { renewalId, created } = await ensureRenewalDraft(sql, id, admin.email ?? null);
    const link = renewalLink(renewalId);
    if (action === 'preview') {
      return NextResponse.json({ ok: true, renewal_id: renewalId, created, link });
    }
    const result = await sendRenewalEmail(sql, renewalId, {
      adminEmail: admin.email ?? null,
      to: typeof body.to === 'string' && body.to.trim() ? body.to.trim() : null,
      rateLock: body.rate_lock !== false,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, renewal_id: renewalId, error: result.error }, { status: 422 });
    }
    return NextResponse.json({ ok: true, renewal_id: renewalId, created, link, sent_to: result.to });
  } catch (err) {
    return NextResponse.json(
      { error: 'renewal failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
});
