/**
 * Trending content store — Neon.
 * Powers the rotating ticker on the RealtyLine/Newsline feeds and the
 * /admin/content/trending management surface.
 */

import { getSql } from '@/lib/db';

export type TrendingMarket = 'realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas';

export interface TrendingItem {
  id: number;
  headline: string;
  subheadline: string | null;
  thumbnail_url: string | null;
  article_url: string;
  icon_prefix: string | null;
  markets: TrendingMarket[];
  sort_order: number;
  is_published: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface TrendingInput {
  headline: string;
  subheadline?: string | null;
  thumbnail_url?: string | null;
  article_url: string;
  icon_prefix?: string | null;
  markets?: TrendingMarket[];
  sort_order?: number;
  is_published?: boolean;
  published_at?: string | null;
  expires_at?: string | null;
  created_by?: string | null;
}

export async function ensureTrendingSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS trending_content (
      id SERIAL PRIMARY KEY,
      headline TEXT NOT NULL,
      subheadline TEXT,
      thumbnail_url TEXT,
      article_url TEXT NOT NULL,
      icon_prefix TEXT DEFAULT '🔥',
      markets TEXT[] NOT NULL DEFAULT '{realtyline}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT false,
      published_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_trending_active ON trending_content (is_published, published_at, expires_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_trending_markets ON trending_content USING GIN (markets)`;
}

export async function getActiveTrending(market: TrendingMarket): Promise<TrendingItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM trending_content
    WHERE is_published = true
      AND (published_at IS NULL OR published_at <= NOW())
      AND (expires_at IS NULL OR expires_at > NOW())
      AND ${market} = ANY(markets)
    ORDER BY sort_order ASC, published_at DESC NULLS LAST
    LIMIT 12
  ` as unknown as TrendingItem[];
  return rows;
}

export async function listAllTrending(): Promise<TrendingItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM trending_content
    ORDER BY sort_order ASC, created_at DESC
  ` as unknown as TrendingItem[];
  return rows;
}

export async function getTrendingById(id: number): Promise<TrendingItem | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM trending_content WHERE id = ${id} LIMIT 1` as unknown as TrendingItem[];
  return rows[0] ?? null;
}

export async function createTrending(input: TrendingInput): Promise<TrendingItem> {
  const sql = getSql();
  const markets = input.markets && input.markets.length ? input.markets : (['realtyline'] as TrendingMarket[]);
  const rows = await sql`
    INSERT INTO trending_content
      (headline, subheadline, thumbnail_url, article_url, icon_prefix,
       markets, sort_order, is_published, published_at, expires_at, created_by)
    VALUES
      (${input.headline}, ${input.subheadline ?? null}, ${input.thumbnail_url ?? null},
       ${input.article_url}, ${input.icon_prefix ?? '🔥'}, ${markets as unknown as string[]},
       ${input.sort_order ?? 0}, ${input.is_published ?? false},
       ${input.published_at ?? null}, ${input.expires_at ?? null}, ${input.created_by ?? null})
    RETURNING *
  ` as unknown as TrendingItem[];
  return rows[0];
}

export async function updateTrending(id: number, patch: Partial<TrendingInput>): Promise<TrendingItem | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE trending_content SET
      headline      = COALESCE(${patch.headline ?? null}, headline),
      subheadline   = ${patch.subheadline ?? null},
      thumbnail_url = ${patch.thumbnail_url ?? null},
      article_url   = COALESCE(${patch.article_url ?? null}, article_url),
      icon_prefix   = COALESCE(${patch.icon_prefix ?? null}, icon_prefix),
      markets       = COALESCE(${(patch.markets ?? null) as unknown as string[] | null}, markets),
      sort_order    = COALESCE(${patch.sort_order ?? null}, sort_order),
      is_published  = COALESCE(${patch.is_published ?? null}, is_published),
      published_at  = ${patch.published_at ?? null},
      expires_at    = ${patch.expires_at ?? null},
      updated_at    = NOW()
    WHERE id = ${id}
    RETURNING *
  ` as unknown as TrendingItem[];
  return rows[0] ?? null;
}

export async function deleteTrending(id: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM trending_content WHERE id = ${id}`;
}

export async function reorderTrending(order: { id: number; sort_order: number }[]): Promise<void> {
  const sql = getSql();
  for (const { id, sort_order } of order) {
    await sql`UPDATE trending_content SET sort_order = ${sort_order}, updated_at = NOW() WHERE id = ${id}`;
  }
}
