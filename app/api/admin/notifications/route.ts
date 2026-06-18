/**
 * /api/admin/notifications
 *   GET  — list notifications (most recent first) with delivery stats.
 *   POST — create a notification. If status='sending', also fans out
 *          immediately via web-push and email channels.
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';
import { broadcastPush } from '@/lib/server/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Category =
  | 'issue_release'
  | 'advertiser_incentive'
  | 'breaking_news'
  | 'event_reminder'
  | 'weekly_digest';

type Status = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

type Market = 'austin' | 'san_antonio' | 'houston' | 'dallas';

type CreateBody = {
  title: string;
  body: string;
  category: Category;
  deepLinkUrl?: string | null;
  market?: Market | null;
  scheduledFor?: string | null; // ISO
  channels?: Array<'web_push' | 'email'>;
  sendNow?: boolean;
};

const VALID_MARKETS: ReadonlySet<Market> = new Set<Market>([
  'austin',
  'san_antonio',
  'houston',
  'dallas',
]);

interface NotificationRow {
  id: string;
  category: Category;
  title: string;
  body: string;
  deep_link_url: string | null;
  target_audience: { market?: string; channels?: string[] } | null;
  scheduled_for: string | null;
  sent_at: string | null;
  status: Status;
  created_by: string | null;
  created_at: string;
  delivered_count: number;
  clicked_count: number;
}

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT n.id, n.category, n.title, n.body, n.deep_link_url,
           n.target_audience, n.scheduled_for, n.sent_at, n.status,
           n.created_by, n.created_at,
           COALESCE((SELECT COUNT(*)::int FROM notification_deliveries d
                      WHERE d.notification_id = n.id AND d.delivered_at IS NOT NULL), 0)
             AS delivered_count,
           COALESCE((SELECT COUNT(*)::int FROM notification_deliveries d
                      WHERE d.notification_id = n.id AND d.clicked_at IS NOT NULL), 0)
             AS clicked_count
      FROM notifications n
     ORDER BY n.created_at DESC
     LIMIT 100
  `) as unknown as NotificationRow[];
  return NextResponse.json({ notifications: rows });
});

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const body = (await req.json()) as CreateBody;

  if (!body?.title?.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (!body?.body?.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }
  if (!body?.category) {
    return NextResponse.json({ error: 'category required' }, { status: 400 });
  }

  const channels = (body.channels && body.channels.length > 0
    ? body.channels
    : ['web_push']) as Array<'web_push' | 'email'>;

  const market = body.market ?? null;
  const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
  const sendNow = !!body.sendNow && !scheduledFor;

  const status: Status = sendNow ? 'sending' : scheduledFor ? 'scheduled' : 'draft';

  const targetAudience = {
    market: market ?? 'all',
    channels,
  };

  const inserted = (await sql`
    INSERT INTO notifications (
      category, title, body, deep_link_url, target_audience,
      scheduled_for, status, created_by
    ) VALUES (
      ${body.category}::notification_category_enum,
      ${body.title.trim()},
      ${body.body.trim()},
      ${body.deepLinkUrl || null},
      ${JSON.stringify(targetAudience)}::jsonb,
      ${scheduledFor},
      ${status}::notification_status_enum,
      ${admin.adminId || null}
    )
    RETURNING id, status, created_at
  `) as unknown as Array<{ id: string; status: Status; created_at: string }>;

  const row = inserted[0];

  let sendResult: { sent: number; failed: number; revoked: number } | null = null;

  if (sendNow) {
    try {
      if (channels.includes('web_push')) {
        sendResult = await broadcastPush(
          row.id,
          {
            title: body.title.trim(),
            body: body.body.trim(),
            url: body.deepLinkUrl || '/dashboard',
            tag: `notif-${row.id}`,
          },
          market && VALID_MARKETS.has(market) ? market : undefined,
        );
      }
      await sql`
        UPDATE notifications
           SET status = 'sent'::notification_status_enum,
               sent_at = NOW()
         WHERE id = ${row.id}::uuid
      `;
    } catch (err) {
      console.error('[admin/notifications] send failed:', err);
      await sql`
        UPDATE notifications
           SET status = 'cancelled'::notification_status_enum
         WHERE id = ${row.id}::uuid
      `;
      return NextResponse.json(
        { error: 'send failed', detail: (err as Error).message, notificationId: row.id },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    status: sendNow ? 'sent' : row.status,
    sendResult,
  });
});
