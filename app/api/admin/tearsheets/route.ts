// app/api/admin/tearsheets/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import { isAdChannel } from '@/lib/ad-channels';
import {
  createTearsheet,
  listTearsheets,
} from '@/lib/server/tearsheets-store';
import {
  TEARSHEET_STATUS_VALUES,
  type TearsheetStatus,
} from '@/lib/insertion-orders';
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
  const ioId = url.searchParams.get('io_id') || undefined;
  const channelParam = url.searchParams.get('channel');
  const channel = channelParam && isAdChannel(channelParam) ? channelParam : undefined;
  const statusParam = url.searchParams.get('status');
  const status = statusParam && (TEARSHEET_STATUS_VALUES as readonly string[]).includes(statusParam)
    ? (statusParam as TearsheetStatus)
    : undefined;

  const rows = await listTearsheets({
    advertiser_id: Number.isFinite(advertiserId) ? advertiserId : undefined,
    io_id: ioId,
    channel,
    status,
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

  const ts = await createTearsheet({
    channel,
    io_id: (body.io_id as string | null) ?? null,
    campaign_id: (body.campaign_id as string | null) ?? null,
    advertiser_id: typeof body.advertiser_id === 'number' ? body.advertiser_id : null,
    publication: (body.publication as string | null) ?? null,
    issue_date: (body.issue_date as string | null) ?? null,
    issue_label: (body.issue_label as string | null) ?? null,
    file_url: (body.file_url as string | null) ?? null,
    file_type: (body.file_type as string | null) ?? null,
    created_by: admin.email ?? null,
  });

  return NextResponse.json({ tearsheet: ts }, { status: 201 });
});
