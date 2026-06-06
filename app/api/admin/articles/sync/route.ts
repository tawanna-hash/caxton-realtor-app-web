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
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  await requireAdmin();

  // Next 16 requires a cacheLife profile as the second arg. 'max' forces an
  // immediate full invalidation regardless of the tag's configured lifetime.
  revalidateTag('wp-news', 'max');
  revalidateTag('wp-news:austin', 'max');
  revalidateTag('wp-news:san_antonio', 'max');

  return NextResponse.json({
    ok: true,
    revalidatedAt: new Date().toISOString(),
  });
});
