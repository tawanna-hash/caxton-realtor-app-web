/**
 * /api/trending
 *   GET — active trending items for a market (public).
 */

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema } from '@/lib/db';
import { ensureTrendingSchema, getActiveTrending, type TrendingMarket } from '@/lib/server/trending-store';
import { isPubKey } from '@/lib/pub-meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseMarket(v: string | null): TrendingMarket {
  return isPubKey(v) ? v : 'realtyline';
}

export const GET = withErrorHandling(async (req: Request) => {
  await ensureSchema();
  await ensureTrendingSchema();
  const url = new URL(req.url);
  const market = parseMarket(url.searchParams.get('market'));
  const items = await getActiveTrending(market);
  return NextResponse.json({ items });
});
