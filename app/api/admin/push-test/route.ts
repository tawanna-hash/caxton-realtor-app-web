/**
 * POST /api/admin/push-test
 *
 * Diagnostic endpoint: sends a one-off web push to every active
 * subscription matching the optional market filter, and returns the
 * raw per-subscription FCM/Mozilla result so we can see exactly what
 * happened. Does NOT write a row to the notifications table.
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';
import { sendPush, type PushMarketFilter } from '@/lib/server/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  title?: string;
  body?: string;
  url?: string;
  market?: PushMarketFilter | 'all';
};

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  market: string | null;
}

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const body = (await req.json().catch(() => ({}))) as Body;
  const title = body.title?.trim() || 'Test push from admin';
  const text = body.body?.trim() || 'If you can see this, web push is working end-to-end.';
  const url = body.url?.trim() || '/dashboard';
  const market = body.market;

  const subs = (market && market !== 'all'
    ? await sql`
        SELECT id, endpoint, p256dh, auth, market
          FROM push_subscriptions
         WHERE revoked_at IS NULL
           AND market = ${market}
      `
    : await sql`
        SELECT id, endpoint, p256dh, auth, market
          FROM push_subscriptions
         WHERE revoked_at IS NULL
      `) as unknown as Sub[];

  const results = await Promise.all(
    subs.map(async (sub) => {
      const res = await sendPush(sub, {
        title,
        body: text,
        url,
        tag: 'rnn-test',
      });
      return {
        subscriptionId: sub.id,
        endpointHost: new URL(sub.endpoint).host,
        market: sub.market,
        ...res,
      };
    }),
  );

  return NextResponse.json({
    ok: true,
    subscriberCount: subs.length,
    sent: results.filter((r) => r.ok).length,
    gone: results.filter((r) => r.gone).length,
    failed: results.filter((r) => !r.ok && !r.gone).length,
    results,
  });
});
