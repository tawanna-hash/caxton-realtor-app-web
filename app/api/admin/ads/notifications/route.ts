/**
 * /api/admin/ads/notifications
 *   GET — unread counts for admin notification badges.
 *
 * "Unread" = inquiries with status='new'. The admin clears the badge by
 * moving an inquiry into any other status (replied / quoted / won / lost /
 * spam) — same lifecycle the inbox already uses, no new schema needed.
 *
 * Returns:
 *   {
 *     unread: {
 *       all: number,
 *       print: number,
 *       digital: number,
 *       email: number,
 *     },
 *     total: number  // alias of unread.all
 *   }
 *
 * Polled from <UnreadAdsBadge /> in the top nav every ~60s.
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';
import type { AdChannel } from '@/lib/ad-channels';

export const runtime = 'nodejs';

interface CountRow {
  channel: string;
  n: number;
}

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();

  const sql = getSql();

  // Fail open: if the table is missing or DB is unreachable (sandbox build),
  // return zeros instead of 500. The badge silently disappears.
  let rows: CountRow[] = [];
  try {
    rows = (await sql`
      SELECT channel, count(*)::int AS n
        FROM ad_inquiries
       WHERE status = 'new'
       GROUP BY channel
    `) as unknown as CountRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ads-notifications] fail-open: ${msg}`);
    rows = [];
  }

  const unread: Record<AdChannel | 'all', number> = {
    all: 0,
    print: 0,
    digital: 0,
    email: 0,
    app: 0,
  };
  for (const r of rows) {
    const c = r.channel === 'print' || r.channel === 'email' ? r.channel : 'digital';
    unread[c] += r.n;
    unread.all += r.n;
  }

  return NextResponse.json({ unread, total: unread.all });
});
