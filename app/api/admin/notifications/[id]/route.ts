/**
 * /api/admin/notifications/[id]
 *   PATCH  — edit a notification. Only allowed when status is draft or
 *            scheduled. If the new status is 'sending' or sendNow=true,
 *            the notification fans out immediately.
 *   DELETE — cancel a scheduled or draft notification.
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureSchema, getSql } from '@/lib/db';
import { broadcastPushAll } from '@/lib/server/push';

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

type UpdateBody = {
  title?: string;
  body?: string;
  category?: Category;
  deepLinkUrl?: string | null;
  market?: Market | null;
  scheduledFor?: string | null;
  channels?: Array<'web_push' | 'email'>;
  sendNow?: boolean;
};

const VALID_MARKETS: ReadonlySet<Market> = new Set<Market>([
  'austin',
  'san_antonio',
  'houston',
  'dallas',
]);

interface ExistingRow {
  id: string;
  status: Status;
  title: string;
  body: string;
  category: Category;
  deep_link_url: string | null;
  target_audience: { market?: string; channels?: string[] } | null;
  scheduled_for: string | null;
}

export const PATCH = withAdminTracking(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    await ensureSchema();
    const sql = getSql();
    const { id } = await ctx.params;

    const existingRows = (await sql`
      SELECT id, status, title, body, category, deep_link_url,
             target_audience, scheduled_for
        FROM notifications
       WHERE id = ${id}::uuid
       LIMIT 1
    `) as unknown as ExistingRow[];

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const existing = existingRows[0];

    if (existing.status !== 'draft' && existing.status !== 'scheduled') {
      return NextResponse.json(
        { error: `cannot edit a notification that is ${existing.status}` },
        { status: 400 },
      );
    }

    const update = (await req.json()) as UpdateBody;
    const has = (key: keyof UpdateBody) => key in update;

    // Preserve omitted columns exactly. A PATCH can independently change a
    // notification field without rewriting a stale editor snapshot.
    const newTitle = has('title') ? (update.title ?? '').trim() : existing.title;
    const newBody = has('body') ? (update.body ?? '').trim() : existing.body;
    const newCategory = has('category') ? update.category : existing.category;
    const newDeepLink = has('deepLinkUrl')
      ? (update.deepLinkUrl?.trim() || null)
      : existing.deep_link_url;
    if (!newTitle) return NextResponse.json({ error: 'title required' }, { status: 400 });
    if (!newBody) return NextResponse.json({ error: 'body required' }, { status: 400 });

    const previousMarket = (existing.target_audience?.market as Market | 'all' | undefined) ?? 'all';
    const newMarketRaw = has('market') ? (update.market ?? 'all') : previousMarket;
    const newMarket: Market | 'all' = newMarketRaw === 'all' ? 'all' : (newMarketRaw as Market);
    const previousChannels = (existing.target_audience?.channels as Array<'web_push' | 'email'>) || ['web_push'];
    const newChannels = has('channels') && Array.isArray(update.channels) && update.channels.length > 0
      ? update.channels
      : previousChannels;

    const scheduleChanged = has('scheduledFor') || update.sendNow === true;
    let scheduledFor = existing.scheduled_for ? new Date(existing.scheduled_for) : null;
    if (has('scheduledFor')) {
      if (update.scheduledFor !== null && typeof update.scheduledFor !== 'string') {
        return NextResponse.json({ error: 'scheduledFor must be an ISO date or null' }, { status: 400 });
      }
      scheduledFor = update.scheduledFor ? new Date(update.scheduledFor) : null;
      if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
        return NextResponse.json({ error: 'scheduledFor must be a valid date' }, { status: 400 });
      }
    }
    const sendNow = update.sendNow === true && !scheduledFor;
    const newStatus: Status = sendNow ? 'sending' : scheduledFor ? 'scheduled' : 'draft';

    if (has('title')) await sql`UPDATE notifications SET title = ${newTitle} WHERE id = ${id}::uuid`;
    if (has('body')) await sql`UPDATE notifications SET body = ${newBody} WHERE id = ${id}::uuid`;
    if (has('category')) await sql`UPDATE notifications SET category = ${newCategory}::notification_category_enum WHERE id = ${id}::uuid`;
    if (has('deepLinkUrl')) await sql`UPDATE notifications SET deep_link_url = ${newDeepLink} WHERE id = ${id}::uuid`;
    if (has('market') || has('channels')) {
      await sql`UPDATE notifications
        SET target_audience = ${JSON.stringify({ market: newMarket, channels: newChannels })}::jsonb
        WHERE id = ${id}::uuid`;
    }
    if (scheduleChanged) {
      await sql`UPDATE notifications
        SET scheduled_for = ${scheduledFor}, status = ${newStatus}::notification_status_enum
        WHERE id = ${id}::uuid`;
    }

    let sendResult: { sent: number; failed: number; revoked: number } | null = null;

    if (sendNow) {
      try {
        if (newChannels.includes('web_push')) {
          const both = await broadcastPushAll(
            id,
            {
              title: newTitle,
              body: newBody,
              url: newDeepLink || '/dashboard',
              tag: `notif-${id}`,
            },
            newMarket !== 'all' && VALID_MARKETS.has(newMarket as Market)
              ? (newMarket as Market)
              : undefined,
          );
          sendResult = {
            sent: both.web.sent + both.ios.sent,
            failed: both.web.failed + both.ios.failed,
            revoked: both.web.revoked + both.ios.revoked,
          };
          console.log('[admin/notifications PATCH] sent', { id, web: both.web, ios: both.ios });
        }
        await sql`
          UPDATE notifications
             SET status = 'sent'::notification_status_enum,
                 sent_at = NOW(),
                 delivered_count = ${sendResult?.sent ?? 0}
           WHERE id = ${id}::uuid
        `;
      } catch (err) {
        console.error('[admin/notifications PATCH] send failed:', err);
        await sql`
          UPDATE notifications
             SET status = 'cancelled'::notification_status_enum
           WHERE id = ${id}::uuid
        `;
        return NextResponse.json(
          { error: 'send failed', detail: (err as Error).message, notificationId: id },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      id,
      status: sendNow ? 'sent' : newStatus,
      sendResult,
    });
  },
);

export const DELETE = withAdminTracking(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    await ensureSchema();
    const sql = getSql();
    const { id } = await ctx.params;

    const rows = (await sql`
      SELECT status FROM notifications WHERE id = ${id}::uuid LIMIT 1
    `) as unknown as Array<{ status: Status }>;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (rows[0].status === 'sent' || rows[0].status === 'sending') {
      return NextResponse.json(
        { error: `cannot cancel a notification that is ${rows[0].status}` },
        { status: 400 },
      );
    }

    await sql`
      UPDATE notifications
         SET status = 'cancelled'::notification_status_enum
       WHERE id = ${id}::uuid
    `;

    return NextResponse.json({ ok: true, id, status: 'cancelled' });
  },
);
