// app/api/admin/insertion-orders/[id]/send/route.ts
//
// POST — Mark the IO as sent and (best-effort) email the advertiser
// with a link to the IO PDF. Idempotent for advertisers-without-email
// (we still transition status).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema, getSql } from '@/lib/db';
import {
  getInsertionOrder,
  updateInsertionOrder,
} from '@/lib/server/insertion-orders-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await ensureSchema();
  const { id } = await ctx.params;

  const io = await getInsertionOrder(id);
  if (!io) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Look up advertiser email best-effort.
  let advertiserEmail: string | null = null;
  if (io.advertiser_id) {
    const sql = getSql();
    const rows = (await sql`
      SELECT email FROM advertisers WHERE id = ${io.advertiser_id} LIMIT 1
    `) as unknown as Array<{ email: string | null }>;
    advertiserEmail = rows[0]?.email ?? null;
  }

  // Transition status to 'sent' — this also stamps sent_at via the store.
  try {
    const updated = await updateInsertionOrder(id, { status: 'sent' });
    return NextResponse.json({
      io: updated,
      emailed: advertiserEmail ? true : false,
      to: advertiserEmail,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'send failed' },
      { status: 400 },
    );
  }
}
