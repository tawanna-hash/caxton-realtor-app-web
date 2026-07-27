/**
 * POST /api/admin/notifications/subscribers/[id]/test-push
 *
 * Sends a one-off test web push to a single subscription. Returns the
 * raw FCM/Mozilla response so the admin can see whether it succeeded,
 * was gone (410), or failed.
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureSchema, getSql } from '@/lib/db';
import { sendPush, markSubscriptionGone } from '@/lib/server/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  revoked_at: string | null;
}

export const POST = withAdminTracking(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    await ensureSchema();
    const sql = getSql();
    const { id } = await ctx.params;

    const rows = (await sql`
      SELECT endpoint, p256dh, auth, revoked_at
        FROM push_subscriptions
       WHERE id = ${id}::uuid
       LIMIT 1
    `) as unknown as SubRow[];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const sub = rows[0];
    if (sub.revoked_at) {
      return NextResponse.json({ error: 'subscription revoked' }, { status: 400 });
    }

    const payload = {
      title: 'Test push from admin',
      body: 'If you can see this, web push is working on this device.',
      url: '/dashboard',
      tag: `rnn-test-${id}`,
    };
    try {
      const body = (await req.json().catch(() => null)) as
        | { title?: string; body?: string; url?: string }
        | null;
      if (body?.title) payload.title = body.title;
      if (body?.body) payload.body = body.body;
      if (body?.url) payload.url = body.url;
    } catch {
      // body parsing failed — use defaults
    }

    const result = await sendPush(sub, payload);
    if (result.gone) {
      await markSubscriptionGone(sub.endpoint);
    }

    return NextResponse.json({
      ok: result.ok,
      gone: result.gone,
      error: result.error,
    });
  },
);
