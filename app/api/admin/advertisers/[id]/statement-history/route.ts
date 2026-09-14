import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const advertiserId = Number((await ctx.params).id);
  if (!Number.isInteger(advertiserId) || advertiserId < 1) return NextResponse.json({ error: 'invalid advertiser id' }, { status: 400 });
  try {
    await ensureSchema();
    const history = await getSql()`SELECT * FROM statement_send_history WHERE advertiser_id = ${advertiserId} ORDER BY sent_at DESC`;
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json({ error: 'could not load statement send history', detail: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const advertiserId = Number((await ctx.params).id);
  if (!Number.isInteger(advertiserId) || advertiserId < 1) return NextResponse.json({ error: 'invalid advertiser id' }, { status: 400 });
  let body: { history_id?: unknown; permanent?: unknown; confirmation_id?: unknown } = {};
  try { body = await request.json(); } catch { /* Report a useful confirmation error below. */ }
  if (typeof body.history_id !== 'string' || !UUID_RE.test(body.history_id)) return NextResponse.json({ error: 'valid history_id is required' }, { status: 400 });
  if (body.permanent !== true || body.confirmation_id !== body.history_id) {
    return NextResponse.json({ error: 'statement history is permanent by default. Send permanent: true and confirmation_id equal to history_id to delete it.', action: 'confirm_permanent_delete' }, { status: 409 });
  }
  try {
    await ensureSchema();
    const rows = await getSql()`DELETE FROM statement_send_history WHERE id = ${body.history_id} AND advertiser_id = ${advertiserId} RETURNING id`;
    if (!rows.length) return NextResponse.json({ error: 'statement history record not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'could not permanently delete statement history', detail: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}
