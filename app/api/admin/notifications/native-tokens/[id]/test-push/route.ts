/**
 * POST /api/admin/notifications/native-tokens/[id]/test-push
 *
 * Sends a one-off test APNs push to a single native device token row.
 * Mirrors /api/admin/notifications/subscribers/[id]/test-push, but for
 * the native_push_tokens table.
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';
import { sendNativePush, markNativeTokenGone } from '@/lib/server/native-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TokenRow {
  token: string;
  platform: 'ios' | 'android';
  revoked_at: string | null;
}

export const POST = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    await ensureSchema();
    const sql = getSql();
    const { id } = await ctx.params;

    const rows = (await sql`
      SELECT token, platform, revoked_at
        FROM native_push_tokens
       WHERE id = ${id}::uuid
       LIMIT 1
    `) as unknown as TokenRow[];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const row = rows[0];
    if (row.revoked_at) {
      return NextResponse.json({ error: 'token revoked' }, { status: 400 });
    }
    if (row.platform !== 'ios') {
      // Android FCM sender isn't wired yet — APNs path only for now.
      return NextResponse.json(
        { error: `platform ${row.platform} not supported yet` },
        { status: 400 },
      );
    }

    const payload = {
      title: 'Test push from admin',
      body: 'If you can see this, iOS push is working end-to-end.',
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

    const result = await sendNativePush(row.token, payload);
    if (result.gone) {
      await markNativeTokenGone(row.token);
    }

    return NextResponse.json({
      ok: result.ok,
      gone: result.gone,
      error: result.error,
    });
  },
);
