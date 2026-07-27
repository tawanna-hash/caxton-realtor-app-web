/**
 * /api/admin/articles/sync
 *   POST — Invalidate WP news cache so the next fetch pulls fresh data from
 *          realtyline.us and newslinesa.com immediately.
 *
 * The wp-news loader wraps each publication in unstable_cache with tags
 * 'wp-news', 'wp-news:austin', 'wp-news:san_antonio'. revalidateTag drops
 * those cache entries so the next getNews() call refetches.
 */

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async () => {
  await requireAdmin();

  // Next 16: revalidateTag(tag, 'max') uses stale-while-revalidate — the
  // NEXT request returns stale data while fresh is fetched in the background,
  // which means the admin shows yesterday's articles after Sync now. Per
  // https://nextjs.org/docs/app/api-reference/functions/revalidateTag, route
  // handlers reacting to external mutations should pass { expire: 0 } so
  // cache entries hard-expire and the next read blocks until WP is refetched.
  revalidateTag('wp-news', { expire: 0 });
  revalidateTag('wp-news:austin', { expire: 0 });
  revalidateTag('wp-news:san_antonio', { expire: 0 });

  return NextResponse.json({
    ok: true,
    revalidatedAt: new Date().toISOString(),
  });
});
