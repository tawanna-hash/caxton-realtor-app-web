// app/api/admin/insertion-orders/route.ts
//
// GET  — list insertion orders (with advertiser name/email joined)
// POST — create a new insertion order (auto-generates io_number)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import { isAdChannel } from '@/lib/ad-channels';
import {
  createInsertionOrder,
  listInsertionOrders,
} from '@/lib/server/insertion-orders-store';
import { IO_STATUS_VALUES, type IoStatus } from '@/lib/insertion-orders';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await ensureSchema();

  const url = new URL(req.url);
  const advertiserIdRaw = url.searchParams.get('advertiser_id');
  const advertiserId = advertiserIdRaw ? Number.parseInt(advertiserIdRaw, 10) : undefined;
  const agreementId = url.searchParams.get('agreement_id') || undefined;
  const channelParam = url.searchParams.get('channel');
  const channel = channelParam && isAdChannel(channelParam) ? channelParam : undefined;
  const statusParam = url.searchParams.get('status');
  const status = statusParam && (IO_STATUS_VALUES as readonly string[]).includes(statusParam)
    ? (statusParam as IoStatus)
    : undefined;
  const q = url.searchParams.get('q')?.trim() || undefined;

  const rows = await listInsertionOrders({
    advertiser_id: Number.isFinite(advertiserId) ? advertiserId : undefined,
    agreement_id: agreementId,
    channel,
    status,
    q,
  });

  return NextResponse.json({ rows });
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await ensureSchema();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const channel = typeof body.channel === 'string' && isAdChannel(body.channel)
    ? body.channel
    : 'digital';

  try {
    const io = await createInsertionOrder({
      channel,
      agreement_id: (body.agreement_id as string | null) ?? null,
      advertiser_id: typeof body.advertiser_id === 'number' ? body.advertiser_id : null,
      campaign_ids: Array.isArray(body.campaign_ids) ? (body.campaign_ids as string[]) : [],
      publication: (body.publication as string | null) ?? null,
      flight_start: (body.flight_start as string | null) ?? null,
      flight_end: (body.flight_end as string | null) ?? null,
      line_items: Array.isArray(body.line_items) ? (body.line_items as never[]) : [],
      total_cents: typeof body.total_cents === 'number' ? body.total_cents : undefined,
      notes: (body.notes as string | null) ?? null,
      created_by: admin.email ?? null,
    });
    return NextResponse.json({ io }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'create failed' },
      { status: 500 },
    );
  }
});
