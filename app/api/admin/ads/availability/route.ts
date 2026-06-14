/**
 * /api/admin/ads/availability
 *   GET — booked windows across all three channels for the calendar view
 *
 * Query params:
 *   channel    'print' | 'digital' | 'email'   (optional, default: all)
 *   rangeStart YYYY-MM-DD                       (optional, default: this month)
 *   rangeEnd   YYYY-MM-DD                       (optional, default: +13 months)
 *
 * Used by /admin/ads/availability. Auth via requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { listBookedWindows } from '@/lib/server/availability-store';
import { isAdChannel } from '@/lib/ad-channels';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asIso(v: string | null): string | undefined {
  return v && ISO_DATE.test(v) ? v : undefined;
}

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const url = new URL(req.url);
  const channelParam = url.searchParams.get('channel');
  const channel =
    channelParam && isAdChannel(channelParam) ? channelParam : undefined;
  const rangeStart = asIso(url.searchParams.get('rangeStart'));
  const rangeEnd = asIso(url.searchParams.get('rangeEnd'));

  const rows = await listBookedWindows({ channel, rangeStart, rangeEnd });
  return NextResponse.json({ rows });
});
