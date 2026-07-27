/**
 * /api/admin/ads/orders
 *   GET — unified pipeline of campaigns + agreements with channel tag
 *
 * Used by /admin/ads/orders. Auth via requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  listOrders,
  countOrdersByChannel,
  type OrderSource,
  type OrderStatus,
} from '@/lib/server/orders-store';
import { isAdChannel } from '@/lib/ad-channels';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

const SOURCES: readonly OrderSource[] = ['campaign', 'agreement'];
const STATUSES: readonly OrderStatus[] = [
  'draft',
  'sent',
  'signed',
  'active',
  'expired',
  'cancelled',
  'paid',
];

function asSource(v: string | null): OrderSource | undefined {
  return v && (SOURCES as readonly string[]).includes(v)
    ? (v as OrderSource)
    : undefined;
}

function asStatus(v: string | null): OrderStatus | undefined {
  return v && (STATUSES as readonly string[]).includes(v)
    ? (v as OrderStatus)
    : undefined;
}

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const url = new URL(req.url);
  const channelParam = url.searchParams.get('channel');
  const channel =
    channelParam && isAdChannel(channelParam) ? channelParam : undefined;
  const source = asSource(url.searchParams.get('source'));
  const status = asStatus(url.searchParams.get('status'));
  const q = url.searchParams.get('q')?.trim() || undefined;
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit')) || 200, 1),
    500,
  );

  const [rows, counts] = await Promise.all([
    listOrders({ channel, source, status, q, limit }),
    countOrdersByChannel(),
  ]);

  return NextResponse.json({ rows, counts });
});
