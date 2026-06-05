/**
 * Data access for featured_social_posts (curated Facebook posts that
 * surface in the RealtyLine + Newsline feeds).
 */

import { getSql } from '@/lib/db';

export type SocialPub = 'realtyline' | 'newsline' | 'both';

export interface FeaturedSocialPost {
  id: number;
  fb_post_id: string;
  page_id: string;
  permalink_url: string;
  message: string | null;
  image_url: string | null;
  posted_at: string | null;
  pub: SocialPub;
  is_open_house: boolean;
  is_active: boolean;
  display_order: number;
  refreshed_at: string;
  created_at: string;
  created_by: string | null;
}

interface DbRow {
  id: number;
  fb_post_id: string;
  page_id: string;
  permalink_url: string;
  message: string | null;
  image_url: string | null;
  posted_at: string | null;
  pub: SocialPub;
  is_open_house: boolean;
  is_active: boolean;
  display_order: number;
  refreshed_at: string;
  created_at: string;
  created_by: string | null;
}

export async function listAllSocialPosts(): Promise<FeaturedSocialPost[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM featured_social_posts
    ORDER BY is_active DESC, display_order ASC, posted_at DESC NULLS LAST
  `) as DbRow[];
  return rows;
}

/**
 * Posts visible to the feed for a given publication.
 * Order: open-house pins first, then display_order, then newest.
 */
export async function listFeedSocialPosts(
  pub: 'realtyline' | 'newsline'
): Promise<FeaturedSocialPost[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM featured_social_posts
    WHERE is_active = TRUE
      AND (pub = ${pub} OR pub = 'both')
    ORDER BY is_open_house DESC,
             display_order ASC,
             posted_at DESC NULLS LAST
  `) as DbRow[];
  return rows;
}

export interface UpsertSocialPostInput {
  fb_post_id: string;
  page_id: string;
  permalink_url: string;
  message: string | null;
  image_url: string | null;
  posted_at: string | null;
  pub: SocialPub;
  is_open_house?: boolean;
  is_active?: boolean;
  display_order?: number;
  created_by?: string | null;
}

export async function upsertSocialPost(
  input: UpsertSocialPostInput
): Promise<FeaturedSocialPost> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO featured_social_posts
      (fb_post_id, page_id, permalink_url, message, image_url, posted_at,
       pub, is_open_house, is_active, display_order, refreshed_at, created_by)
    VALUES
      (${input.fb_post_id}, ${input.page_id}, ${input.permalink_url},
       ${input.message}, ${input.image_url}, ${input.posted_at},
       ${input.pub}, ${input.is_open_house ?? false}, ${input.is_active ?? true},
       ${input.display_order ?? 0}, NOW(), ${input.created_by ?? null})
    ON CONFLICT (fb_post_id) DO UPDATE SET
      page_id       = EXCLUDED.page_id,
      permalink_url = EXCLUDED.permalink_url,
      message       = EXCLUDED.message,
      image_url     = EXCLUDED.image_url,
      posted_at     = EXCLUDED.posted_at,
      refreshed_at  = NOW()
    RETURNING *
  `) as DbRow[];
  return rows[0];
}

export interface UpdateSocialPostInput {
  pub?: SocialPub;
  is_open_house?: boolean;
  is_active?: boolean;
  display_order?: number;
}

export async function updateSocialPost(
  id: number,
  patch: UpdateSocialPostInput
): Promise<FeaturedSocialPost | null> {
  const sql = getSql();
  // Use COALESCE to leave unspecified fields untouched.
  const rows = (await sql`
    UPDATE featured_social_posts SET
      pub           = COALESCE(${patch.pub ?? null}, pub),
      is_open_house = COALESCE(${patch.is_open_house ?? null}, is_open_house),
      is_active     = COALESCE(${patch.is_active ?? null}, is_active),
      display_order = COALESCE(${patch.display_order ?? null}, display_order)
    WHERE id = ${id}
    RETURNING *
  `) as DbRow[];
  return rows[0] ?? null;
}

export async function deleteSocialPost(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM featured_social_posts WHERE id = ${id} RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

/** All posts that need a refresh (older than 24h or never refreshed). */
export async function listStaleSocialPosts(): Promise<FeaturedSocialPost[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM featured_social_posts
    WHERE is_active = TRUE
      AND (refreshed_at IS NULL OR refreshed_at < NOW() - INTERVAL '24 hours')
    ORDER BY refreshed_at ASC NULLS FIRST
  `) as DbRow[];
  return rows;
}

/**
 * Active posts that have NOT yet been scanned by the Gemini event detector
 * (no row in events with source_post_id = this post). Limit caps how many
 * we send to Gemini per cron tick — Gemini Flash free tier is 15 req/min,
 * 1500/day, and we run hourly, so 30 is a comfortable ceiling.
 *
 * Excludes posts with no message text (nothing for Gemini to read).
 */
export async function listSocialPostsForLLMScan(
  limit = 30
): Promise<FeaturedSocialPost[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT p.* FROM featured_social_posts p
    LEFT JOIN events e ON e.source_post_id = p.id
    WHERE p.is_active = TRUE
      AND p.message IS NOT NULL
      AND length(trim(p.message)) > 20
      AND e.id IS NULL
    ORDER BY p.posted_at DESC NULLS LAST
    LIMIT ${limit}
  `) as DbRow[];
  return rows;
}

/**
 * Distinct Facebook Page IDs we've curated posts from, with the publication
 * each Page maps to. Used by the Graph API events cron to know which Pages
 * to query for native FB events.
 *
 * If multiple posts from the same page_id map to different pubs (very rare —
 * usually only happens if an admin reassigned a post), we keep the most
 * common pub for that page via a simple GROUP BY count.
 */
export async function listScannablePageIds(): Promise<
  Array<{ pageId: string; pub: SocialPub }>
> {
  const sql = getSql();
  const rows = (await sql`
    SELECT page_id, pub, COUNT(*)::int AS n
    FROM featured_social_posts
    WHERE is_active = TRUE
      AND page_id IS NOT NULL
      AND length(page_id) > 0
    GROUP BY page_id, pub
    ORDER BY page_id, n DESC
  `) as Array<{ page_id: string; pub: SocialPub; n: number }>;

  // Collapse to one row per page_id, picking the pub with the most posts.
  const seen = new Map<string, SocialPub>();
  for (const r of rows) {
    if (!seen.has(r.page_id)) seen.set(r.page_id, r.pub);
  }
  return Array.from(seen.entries()).map(([pageId, pub]) => ({ pageId, pub }));
}
