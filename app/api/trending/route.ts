/**
 * /api/trending
 *   GET — active trending items for a market (public).
 */

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema } from '@/lib/db';
import { ensureTrendingSchema, getActiveTrending, type TrendingMarket } from '@/lib/server/trending-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS: readonly TrendingMarket[] = ['realtyline', 'newsline'] as const;

function parseMarket(v: string | null): TrendingMarket {
  return (MARKETS as readonly string[]).includes(v ?? '')
    ? (v as TrendingMarket)
    : 'realtyline';
}

export const GET = withErrorHandling(async (req: Request) => {
  await ensureSchema();
  await ensureTrendingSchema();
  const url = new URL(req.url);
  const market = parseMarket(url.searchParams.get('market'));
  const items = await getActiveTrending(market);
  return NextResponse.json({ items });
});
