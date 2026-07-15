// app/api/admin/insertion-orders/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import { isAdChannel } from '@/lib/ad-channels';
import {
  deleteInsertionOrder,
  getInsertionOrder,
  updateInsertionOrder,
} from '@/lib/server/insertion-orders-store';
import { IO_STATUS_VALUES, type IoStatus } from '@/lib/insertion-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await ctx.params;
  const io = await getInsertionOrder(id);
  if (!io) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ io });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const patch: Parameters<typeof updateInsertionOrder>[1] = {};
  if (typeof body.status === 'string' && (IO_STATUS_VALUES as readonly string[]).includes(body.status)) {
    patch.status = body.status as IoStatus;
  }
  if (typeof body.channel === 'string' && isAdChannel(body.channel)) patch.channel = body.channel;
  if ('agreement_id' in body) patch.agreement_id = (body.agreement_id as string | null) ?? null;
  if ('advertiser_id' in body) patch.advertiser_id = (body.advertiser_id as number | null) ?? null;
  if (Array.isArray(body.campaign_ids)) patch.campaign_ids = body.campaign_ids as string[];
  if ('publication' in body) patch.publication = (body.publication as string | null) ?? null;
  if ('flight_start' in body) patch.flight_start = (body.flight_start as string | null) ?? null;
  if ('flight_end' in body) patch.flight_end = (body.flight_end as string | null) ?? null;
  if (Array.isArray(body.line_items)) patch.line_items = body.line_items as never[];
  if (typeof body.total_cents === 'number') patch.total_cents = body.total_cents;
  if ('notes' in body) patch.notes = (body.notes as string | null) ?? null;

  try {
    const io = await updateInsertionOrder(id, patch);
    if (!io) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ io });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'update failed' },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await ctx.params;
  const ok = await deleteInsertionOrder(id);
  return NextResponse.json({ ok });
}
