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
import { sendNativePush } from '@/lib/server/native-push';

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

  // Native iOS tokens. Same market filter so admins testing a regional
  // notification get the matching slice of the audience.
  type NativeTokenRow = { id: string; token: string; platform: 'ios' | 'android'; market: string | null };
  const nativeTokens = (market && market !== 'all'
    ? await sql`
        SELECT id, token, platform, market
          FROM native_push_tokens
         WHERE revoked_at IS NULL
           AND platform = 'ios'
           AND market = ${market}
      `
    : await sql`
        SELECT id, token, platform, market
          FROM native_push_tokens
         WHERE revoked_at IS NULL
           AND platform = 'ios'
      `) as unknown as NativeTokenRow[];

  const nativeResults = await Promise.all(
    nativeTokens.map(async (row) => {
      const res = await sendNativePush(row.token, {
        title,
        body: text,
        url,
        tag: 'rnn-test',
      });
      return {
        tokenId: row.id,
        platform: row.platform,
        market: row.market,
        ...res,
      };
    }),
  );

  return NextResponse.json({
    ok: true,
    web: {
      subscriberCount: subs.length,
      sent: results.filter((r) => r.ok).length,
      gone: results.filter((r) => r.gone).length,
      failed: results.filter((r) => !r.ok && !r.gone).length,
      results,
    },
    ios: {
      tokenCount: nativeTokens.length,
      sent: nativeResults.filter((r) => r.ok).length,
      gone: nativeResults.filter((r) => r.gone).length,
      failed: nativeResults.filter((r) => !r.ok && !r.gone).length,
      results: nativeResults,
    },
    // Combined totals — preserved for any caller that was reading the
    // old flat shape. Admins reading the new per-channel breakdown should
    // prefer .web / .ios.
    subscriberCount: subs.length + nativeTokens.length,
    sent: results.filter((r) => r.ok).length + nativeResults.filter((r) => r.ok).length,
    gone: results.filter((r) => r.gone).length + nativeResults.filter((r) => r.gone).length,
    failed:
      results.filter((r) => !r.ok && !r.gone).length +
      nativeResults.filter((r) => !r.ok && !r.gone).length,
  });
});
