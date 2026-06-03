/**
 * POST /api/admin/social/harvest
 *
 * Pre-flight helper for the SocialClient form. Given a Facebook URL the
 * admin pasted, we try to auto-extract caption + image + posted-at from
 * the publicly-visible OpenGraph tags so the admin doesn't have to copy
 * them by hand.
 *
 * Returns the harvested fields (which the UI uses to pre-fill the form),
 * or { harvested: false, reason } so the UI can fall back to manual entry.
 *
 * Notes:
 *   • Page URLs: harvester works but the main /api/admin/social already
 *     auto-fetches via Graph API — UI doesn't need to call this for Page
 *     posts.
 *   • Group URLs: this is the primary path. Graph API can't read group
 *     posts since the Groups API was deprecated in 2024.
 *   • Reel URLs: rejected (same reason as in the main POST handler).
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { parseFacebookPostUrl } from '@/lib/server/facebook';
import { harvestFacebookPostHtml } from '@/lib/server/facebook-harvester';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();

  const body = (await req.json()) as { url?: string };
  const url = (body.url ?? '').trim();
  if (!url) throw new ApiError(400, 'url is required');

  // Validate the URL shape and surface a clean kind label to the UI.
  let parsed;
  try {
    parsed = parseFacebookPostUrl(url);
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }

  if (parsed.kind === 'reel') {
    throw new ApiError(
      400,
      'Reel URLs are not supported. Paste a Facebook Page post or Group post URL instead.'
    );
  }

  const result = await harvestFacebookPostHtml(url);

  return NextResponse.json({
    kind: parsed.kind,
    fbPostId: parsed.fbPostId,
    pageHint: parsed.pageHint ?? null,
    ...result,
  });
});
