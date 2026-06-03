/**
 * /api/admin/social
 *   GET  — list all featured social posts (active + inactive)
 *   POST — add a new post by URL { url, pub, is_open_house?, ...manualFields }
 *
 * POST flow:
 *   1. Parse the URL → canonical fb_post_id + kind ('page' | 'group')
 *   2a. If kind === 'page' → fetch metadata from Graph API
 *   2b. If kind === 'group' → require manualFields in the body
 *       (Groups API was deprecated by Meta in 2024)
 *   3. Upsert into featured_social_posts
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { ensureSchema } from '@/lib/db';
import {
  listAllSocialPosts,
  upsertSocialPost,
  type SocialPub,
} from '@/lib/server/social-store';
import {
  parseFacebookPostUrl,
  fetchFacebookPostMetadata,
  FacebookConfigError,
  FacebookFetchError,
} from '@/lib/server/facebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();
  const posts = await listAllSocialPosts();
  return NextResponse.json({ posts });
});

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await requireAdmin();
  await ensureSchema();

  const body = (await req.json()) as {
    url?: string;
    pub?: SocialPub;
    is_open_house?: boolean;
    // Manual fields (required when URL is a group post; ignored otherwise)
    message?: string | null;
    image_url?: string | null;
    posted_at?: string | null; // ISO timestamp
  };

  const url = (body.url ?? '').trim();
  if (!url) throw new ApiError(400, 'url is required');

  const pub: SocialPub = body.pub ?? 'both';
  if (!['realtyline', 'newsline', 'both'].includes(pub)) {
    throw new ApiError(400, 'pub must be realtyline | newsline | both');
  }

  // Parse URL → ID + kind
  let parsed;
  try {
    parsed = parseFacebookPostUrl(url);
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }

  // Per Option B (decided 2026-06-02): only Page posts are curated through
  // this tool. Group + Reel URLs are rejected here even though the manual-
  // entry code path below still exists — if the team reverses course, just
  // remove this guard.
  if (parsed.kind !== 'page') {
    const label = parsed.kind === 'reel' ? 'Reel' : 'Group';
    throw new ApiError(
      400,
      `${label} URLs are not supported. Paste a Facebook Page post URL instead.`
    );
  }

  let post;

  if (parsed.kind === 'page') {
    // ─── Page post: auto-fetch via Graph API ──────────────────────────
    let meta;
    try {
      meta = await fetchFacebookPostMetadata(parsed.fbPostId);
    } catch (e) {
      if (e instanceof FacebookConfigError) {
        throw new ApiError(500, e.message);
      }
      if (e instanceof FacebookFetchError) {
        throw new ApiError(e.status === 404 ? 404 : 502, e.message);
      }
      throw e;
    }

    post = await upsertSocialPost({
      fb_post_id: meta.fbPostId,
      page_id: meta.pageId || parsed.pageHint || '',
      permalink_url: meta.permalinkUrl,
      message: meta.message,
      image_url: meta.imageUrl,
      posted_at: meta.postedAt,
      pub,
      is_open_house: body.is_open_house ?? false,
      created_by: admin.email ?? null,
    });
  } else {
    // ─── Group / Reel post: manual fields required ────────────────────
    // • Groups: Meta deprecated the Groups API in 2024 — no supported way
    //   to read group post content programmatically, even for group admins.
    // • Reels: /{page_id}/video_reels only returns reels the Page itself
    //   authored; reshares + tagged reels can't be fetched by ID without
    //   pages_read_user_content + Page Public Content Access (App Review).
    const kindLabel = parsed.kind === 'reel' ? 'Reel' : 'Group post';
    const message = (body.message ?? '').trim();
    const imageUrl = (body.image_url ?? '').trim() || null;
    const postedAt = (body.posted_at ?? '').trim() || null;

    if (!message && !imageUrl) {
      throw new ApiError(
        400,
        `${kindLabel}s require either a caption (message) or an image/thumbnail. ` +
          'Paste a Page post URL to auto-fetch instead.'
      );
    }

    post = await upsertSocialPost({
      fb_post_id: parsed.fbPostId,
      page_id: parsed.pageHint || '',
      permalink_url: url,
      message: message || null,
      image_url: imageUrl,
      posted_at: postedAt,
      pub,
      is_open_house: body.is_open_house ?? false,
      created_by: admin.email ?? null,
    });
  }

  return NextResponse.json({ post, source: parsed.kind }, { status: 201 });
});
