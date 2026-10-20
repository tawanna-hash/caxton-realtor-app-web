// app/api/admin/new-partner-v2/[id]/route.ts
//
// New-partner agreements (Beta). POST { action: 'preview' | 'send', to?: string }
//   preview — returns the partner link. Sends nothing, changes nothing.
//   send    — emails the link to the partner.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { agreementLink, sendNewPartnerEmail } from '@/lib/new-partner-v2/service';

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

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT id, signed_at, is_renewal FROM agreements WHERE id = ${id}` as unknown as Array<{ id: string; signed_at: string | null; is_renewal: boolean | null }>;
    if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (rows[0].is_renewal) return NextResponse.json({ error: 'Renewals use the Renewals tab.' }, { status: 422 });
    if (rows[0].signed_at) return NextResponse.json({ error: 'Already signed.' }, { status: 409 });

    const link = agreementLink(id);
    if (body.action !== 'send') return NextResponse.json({ ok: true, link });

    const result = await sendNewPartnerEmail(sql, id, {
      adminEmail: admin.email ?? null,
      to: typeof body.to === 'string' && body.to.trim() ? body.to.trim() : null,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    return NextResponse.json({ ok: true, link, sent_to: result.to });
  } catch (err) {
    return NextResponse.json({ error: 'send failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
