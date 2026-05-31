// app/api/admin/agreements/[id]/mark-notice/route.ts
//
// POST — record that a renewal notice has been sent for this agreement.
// Body (optional): { sent_on?: 'YYYY-MM-DD' | null }
//   - If sent_on is provided, sets renewal_notice_date to that value
//   - If sent_on is null, clears the field
//   - If body is empty, defaults to CURRENT_DATE

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type RouteCtx = { params: Promise<{ id: string }> };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: { sent_on?: string | null } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  let sentOn: string | null | 'today' = 'today';
  if (body.sent_on === null) sentOn = null;
  else if (typeof body.sent_on === 'string') {
    if (!DATE_RE.test(body.sent_on)) {
      return NextResponse.json({ error: 'sent_on must be YYYY-MM-DD' }, { status: 400 });
    }
    sentOn = body.sent_on;
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (sentOn === 'today')
      ? await sql`
          UPDATE agreements SET renewal_notice_date = CURRENT_DATE, updated_at = NOW()
           WHERE id = ${id}
           RETURNING id, renewal_notice_date
        ` as unknown as Array<Record<string, unknown>>
      : await sql`
          UPDATE agreements SET renewal_notice_date = ${sentOn}, updated_at = NOW()
           WHERE id = ${id}
           RETURNING id, renewal_notice_date
        ` as unknown as Array<Record<string, unknown>>;

    if (rows.length === 0) return NextResponse.json({ error: 'agreement not found' }, { status: 404 });
    return NextResponse.json({ agreement: rows[0] });
  } catch (err) {
    console.error('[admin/agreements/mark-notice POST]', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}
