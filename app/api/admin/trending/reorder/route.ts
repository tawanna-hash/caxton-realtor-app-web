/**
 * /api/admin/trending/reorder — batch sort_order update.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureSchema } from '@/lib/db';
import { ensureTrendingSchema, reorderTrending } from '@/lib/server/trending-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  await ensureTrendingSchema();
  const body = await req.json() as { order?: unknown };
  if (!Array.isArray(body.order)) {
    return NextResponse.json({ error: 'order must be an array' }, { status: 400 });
  }
  const clean: { id: number; sort_order: number }[] = [];
  for (const row of body.order) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = Number(r.id);
    const sort_order = Number(r.sort_order);
    if (Number.isInteger(id) && id > 0 && Number.isInteger(sort_order)) {
      clean.push({ id, sort_order });
    }
  }
  await reorderTrending(clean);
  return NextResponse.json({ ok: true });
});
