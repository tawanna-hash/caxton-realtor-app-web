// app/api/cron/send-scheduled-notifications/route.ts
//
// Fires any push notifications whose status='scheduled' and whose
// scheduled_for time has passed. Marks each as 'sending' (claim), runs
// the web-push fan-out, then flips to 'sent' (or 'cancelled' on hard
// failure). Designed to be hit on a 1-minute Vercel cron.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/send-scheduled-notifications
//
// Vercel Cron sends the `x-vercel-cron` header on scheduled invocations,
// which we accept in lieu of the bearer for convenience.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { broadcastPushAll } from '@/lib/server/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Market = 'austin' | 'san_antonio' | 'houston' | 'dallas';
const VALID_MARKETS: ReadonlySet<Market> = new Set<Market>([
  'austin',
  'san_antonio',
  'houston',
  'dallas',
]);

interface DueRow {
  id: string;
  title: string;
  body: string;
  deep_link_url: string | null;
  target_audience: { market?: string; channels?: string[] } | null;
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, message: 'CRON_SECRET env var is not set.' },
      { status: 500 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  }

  const started = Date.now();
  await ensureSchema();
  const sql = getSql();

  // Atomically claim due rows so two overlapping cron invocations cannot
  // double-send. The `FOR UPDATE SKIP LOCKED` clause skips rows another
  // transaction is already processing.
  const due = (await sql`
    WITH claimed AS (
      SELECT id
        FROM notifications
       WHERE status = 'scheduled'::notification_status_enum
         AND scheduled_for IS NOT NULL
         AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC
       LIMIT 25
       FOR UPDATE SKIP LOCKED
    )
    UPDATE notifications n
       SET status = 'sending'::notification_status_enum
      FROM claimed c
     WHERE n.id = c.id
    RETURNING n.id, n.title, n.body, n.deep_link_url, n.target_audience
  `) as unknown as DueRow[];

  const results: Array<{
    id: string;
    sent: number;
    failed: number;
    revoked: number;
    error?: string;
  }> = [];

  for (const row of due) {
    const channels = (row.target_audience?.channels as Array<'web_push' | 'email'>) || ['web_push'];
    const marketRaw = row.target_audience?.market;
    const market: Market | undefined =
      marketRaw && marketRaw !== 'all' && VALID_MARKETS.has(marketRaw as Market)
        ? (marketRaw as Market)
        : undefined;

    try {
      let sendResult = { sent: 0, failed: 0, revoked: 0 };
      if (channels.includes('web_push')) {
        const both = await broadcastPushAll(
          row.id,
          {
            title: row.title,
            body: row.body,
            url: row.deep_link_url || '/dashboard',
            tag: `notif-${row.id}`,
          },
          market,
        );
        // 'web_push' channel here means "the default push fan-out" — we
        // include native iOS alongside it so an opted-in iPhone user gets
        // exactly one push per notification, on whichever channel they have.
        sendResult = {
          sent: both.web.sent + both.ios.sent,
          failed: both.web.failed + both.ios.failed,
          revoked: both.web.revoked + both.ios.revoked,
        };
        console.log('[cron/send-scheduled-notifications] sent', { id: row.id, web: both.web, ios: both.ios });
      }
      await sql`
        UPDATE notifications
           SET status = 'sent'::notification_status_enum,
               sent_at = NOW()
         WHERE id = ${row.id}::uuid
      `;
      results.push({ id: row.id, ...sendResult });
    } catch (err) {
      console.error('[cron/send-scheduled-notifications] send failed:', row.id, err);
      await sql`
        UPDATE notifications
           SET status = 'cancelled'::notification_status_enum
         WHERE id = ${row.id}::uuid
      `;
      results.push({
        id: row.id,
        sent: 0,
        failed: 0,
        revoked: 0,
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    claimed: due.length,
    results,
  });
}
