/**
 * /api/admin/trending
 *   GET  — list all trending items (admin).
 *   POST — create a new trending item.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema } from '@/lib/db';
import {
  ensureTrendingSchema,
  listAllTrending,
  createTrending,
  type TrendingMarket,
} from '@/lib/server/trending-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS: readonly TrendingMarket[] = ['realtyline', 'newsline'] as const;

function coerceMarkets(v: unknown): TrendingMarket[] {
  if (!Array.isArray(v)) return ['realtyline'];
  const filtered = v.filter((m): m is TrendingMarket =>
    typeof m === 'string' && (MARKETS as readonly string[]).includes(m),
  );
  return filtered.length ? filtered : ['realtyline'];
}

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();
  await ensureTrendingSchema();
  const items = await listAllTrending();
  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await requireAdmin();
  await ensureSchema();
  await ensureTrendingSchema();

  const body = await req.json() as Record<string, unknown>;
  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  const article_url = typeof body.article_url === 'string' ? body.article_url.trim() : '';
  if (!headline || !article_url) {
    return NextResponse.json({ error: 'headline and article_url required' }, { status: 400 });
  }

  const adminId = (admin as unknown as { email?: string; id?: string }).email
    ?? (admin as unknown as { email?: string; id?: string }).id
    ?? null;

  const item = await createTrending({
    headline,
    article_url,
    subheadline: typeof body.subheadline === 'string' ? body.subheadline : null,
    thumbnail_url: typeof body.thumbnail_url === 'string' ? body.thumbnail_url : null,
    icon_prefix: typeof body.icon_prefix === 'string' ? body.icon_prefix : '🔥',
    markets: coerceMarkets(body.markets),
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
    is_published: body.is_published === true,
    published_at: typeof body.published_at === 'string' ? body.published_at : null,
    expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
    created_by: adminId,
  });
  return NextResponse.json({ item });
});
