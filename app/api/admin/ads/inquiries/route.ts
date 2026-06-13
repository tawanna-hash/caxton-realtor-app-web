/**
 * /api/admin/ads/inquiries
 *   GET — list inquiries with optional channel / status / q / pagination filters
 *
 * Used by the admin inbox at /admin/ads/inquiries. Auth via requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import {
  listAdInquiries,
  countAdInquiries,
  type AdInquiryStatus,
} from '@/lib/server/ad-inquiries-store';
import { isAdChannel, type AdChannel } from '@/lib/ad-channels';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

const STATUSES: readonly AdInquiryStatus[] = [
  'new',
  'replied',
  'quoted',
  'won',
  'lost',
  'spam',
] as const;

function parseStatus(v: string | null): AdInquiryStatus | undefined {
  if (!v) return undefined;
  return (STATUSES as readonly string[]).includes(v)
    ? (v as AdInquiryStatus)
    : undefined;
}

function parseChannel(v: string | null): AdChannel | undefined {
  return v && isAdChannel(v) ? v : undefined;
}

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const url = new URL(req.url);
  const channel = parseChannel(url.searchParams.get('channel'));
  const status = parseStatus(url.searchParams.get('status'));
  const q = url.searchParams.get('q')?.trim() || undefined;
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit')) || 50, 1),
    200,
  );
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const list = await listAdInquiries({ channel, status, q, limit, offset });

  // Compute per-channel counts for the tab badges. These are independent of
  // the current filter so the inbox header always shows the true workload.
  const [allNew, printNew, digitalNew, emailNew] = await Promise.all([
    countAdInquiries({ status: 'new' }),
    countAdInquiries({ channel: 'print', status: 'new' }),
    countAdInquiries({ channel: 'digital', status: 'new' }),
    countAdInquiries({ channel: 'email', status: 'new' }),
  ]);

  return NextResponse.json({
    rows: list.rows,
    total: list.total,
    limit,
    offset,
    unread: {
      all: allNew,
      print: printNew,
      digital: digitalNew,
      email: emailNew,
    },
  });
});
