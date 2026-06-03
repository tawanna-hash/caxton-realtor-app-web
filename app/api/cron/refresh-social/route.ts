/**
 * /api/cron/refresh-social
 *
 * Daily cron that re-fetches each active featured social post from the
 * Facebook Graph API so message text, image URLs, and timestamps don't go
 * stale. Inactive posts are skipped. Soft-failures (one bad post) don't
 * abort the whole run.
 */

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import {
  listStaleSocialPosts,
  upsertSocialPost,
} from '@/lib/server/social-store';
import {
  fetchFacebookPostMetadata,
  FacebookConfigError,
} from '@/lib/server/facebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  let attempted = 0;
  let refreshed = 0;
  let failed = 0;
  const errors: Array<{ id: number; fb_post_id: string; error: string }> = [];

  let stale;
  try {
    stale = await listStaleSocialPosts();
  } catch (e) {
    return NextResponse.json(
      { error: 'db error', detail: (e as Error).message },
      { status: 500 }
    );
  }

  for (const p of stale) {
    // Group posts can't be refreshed via Graph API (Meta deprecated the
    // Groups API in 2024). Skip them — their manually entered metadata
    // stays as-is.
    if (/\/groups\//i.test(p.permalink_url)) {
      continue;
    }
    attempted++;
    try {
      const meta = await fetchFacebookPostMetadata(p.fb_post_id);
      await upsertSocialPost({
        fb_post_id: meta.fbPostId,
        page_id: meta.pageId || p.page_id,
        permalink_url: meta.permalinkUrl,
        message: meta.message,
        image_url: meta.imageUrl,
        posted_at: meta.postedAt,
        pub: p.pub,
      });
      refreshed++;
    } catch (e) {
      failed++;
      const msg = (e as Error).message;
      errors.push({ id: p.id, fb_post_id: p.fb_post_id, error: msg });
      // Config error means token is missing — no point hitting the rest.
      if (e instanceof FacebookConfigError) break;
    }
  }

  return NextResponse.json({
    ok: true,
    attempted,
    refreshed,
    failed,
    errors,
  });
}
