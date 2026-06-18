/**
 * /api/admin/notifications/subscribers/[id]
 *   PATCH  — update a subscriber (currently: market).
 *   DELETE — revoke a subscriber (soft delete via revoked_at).
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Market = 'austin' | 'san_antonio' | 'houston' | 'dallas';
const VALID_MARKETS: ReadonlySet<Market> = new Set<Market>([
  'austin',
  'san_antonio',
  'houston',
  'dallas',
]);

type UpdateBody = {
  market?: Market | null;
};

export const PATCH = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    await ensureSchema();
    const sql = getSql();
    const { id } = await ctx.params;

    const body = (await req.json()) as UpdateBody;

    if (body.market !== undefined) {
      if (body.market !== null && !VALID_MARKETS.has(body.market)) {
        return NextResponse.json({ error: 'invalid market' }, { status: 400 });
      }
      await sql`
        UPDATE push_subscriptions
           SET market = ${body.market}
         WHERE id = ${id}::uuid
      `;
    }

    return NextResponse.json({ ok: true, id });
  },
);

export const DELETE = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    await ensureSchema();
    const sql = getSql();
    const { id } = await ctx.params;

    await sql`
      UPDATE push_subscriptions
         SET revoked_at = NOW()
       WHERE id = ${id}::uuid
         AND revoked_at IS NULL
    `;

    return NextResponse.json({ ok: true, id });
  },
);
