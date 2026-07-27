/**
 * /api/admin/trending/[id]
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureSchema } from '@/lib/db';
import {
  ensureTrendingSchema,
  getTrendingById,
  updateTrending,
  deleteTrending,
  type TrendingMarket,
} from '@/lib/server/trending-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS: readonly TrendingMarket[] = ['realtyline', 'newsline'] as const;

function coerceMarkets(v: unknown): TrendingMarket[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const filtered = v.filter((m): m is TrendingMarket =>
    typeof m === 'string' && (MARKETS as readonly string[]).includes(m),
  );
  return filtered.length ? filtered : undefined;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withAdminTracking(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  await ensureSchema();
  await ensureTrendingSchema();
  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const item = await getTrendingById(id);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ item });
});

export const PATCH = withAdminTracking(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  await ensureSchema();
  await ensureTrendingSchema();
  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;
  const item = await updateTrending(id, {
    headline: typeof body.headline === 'string' ? body.headline : undefined,
    subheadline: typeof body.subheadline === 'string' ? body.subheadline : (body.subheadline === null ? null : undefined),
    thumbnail_url: typeof body.thumbnail_url === 'string' ? body.thumbnail_url : (body.thumbnail_url === null ? null : undefined),
    article_url: typeof body.article_url === 'string' ? body.article_url : undefined,
    icon_prefix: typeof body.icon_prefix === 'string' ? body.icon_prefix : undefined,
    markets: coerceMarkets(body.markets),
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : undefined,
    is_published: typeof body.is_published === 'boolean' ? body.is_published : undefined,
    published_at: typeof body.published_at === 'string' ? body.published_at : (body.published_at === null ? null : undefined),
    expires_at: typeof body.expires_at === 'string' ? body.expires_at : (body.expires_at === null ? null : undefined),
  });
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ item });
});

export const DELETE = withAdminTracking(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  await ensureSchema();
  await ensureTrendingSchema();
  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  await deleteTrending(id);
  return NextResponse.json({ ok: true });
});
