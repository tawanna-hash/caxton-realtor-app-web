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

export const PATCH = withErrorHandling(
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

    const newTitle = (update.title ?? existing.title).trim();
    const newBody = (update.body ?? existing.body).trim();
    const newCategory = (update.category ?? existing.category) as Category;
    const newDeepLink =
      update.deepLinkUrl === undefined ? existing.deep_link_url : update.deepLinkUrl || null;

    const previousMarket = (existing.target_audience?.market as Market | 'all' | undefined) ?? 'all';
    const newMarketRaw =
      update.market === undefined ? previousMarket : update.market ?? 'all';
    const newMarket: Market | 'all' = newMarketRaw === 'all' ? 'all' : (newMarketRaw as Market);

    const previousChannels = (existing.target_audience?.channels as Array<'web_push' | 'email'>) || ['web_push'];
    const newChannels =
      update.channels && update.channels.length > 0 ? update.channels : previousChannels;

    if (!newTitle) {
      return NextResponse.json({ error: 'title required' }, { status: 400 });
    }
    if (!newBody) {
      return NextResponse.json({ error: 'body required' }, { status: 400 });
    }

    const scheduledForRaw =
      update.scheduledFor === undefined
        ? existing.scheduled_for
        : update.scheduledFor;
    const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : null;
    const sendNow = !!update.sendNow && !scheduledFor;
    const newStatus: Status = sendNow ? 'sending' : scheduledFor ? 'scheduled' : 'draft';

    const targetAudience = {
      market: newMarket,
      channels: newChannels,
    };

    await sql`
      UPDATE notifications
         SET title = ${newTitle},
             body = ${newBody},
             category = ${newCategory}::notification_category_enum,
             deep_link_url = ${newDeepLink},
             target_audience = ${JSON.stringify(targetAudience)}::jsonb,
             scheduled_for = ${scheduledFor},
             status = ${newStatus}::notification_status_enum
       WHERE id = ${id}::uuid
    `;

    let sendResult: { sent: number; failed: number; revoked: number } | null = null;

    if (sendNow) {
      try {
        if (newChannels.includes('web_push')) {
          sendResult = await broadcastPush(
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
        }
        await sql`
          UPDATE notifications
             SET status = 'sent'::notification_status_enum,
                 sent_at = NOW()
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

export const DELETE = withErrorHandling(
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
