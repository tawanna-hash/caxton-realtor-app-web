/**
 * /api/social/feed  GET
 *
 * Returns active curated Facebook posts for the requested publication.
 * Consumed by the dashboard feed (Social pill + mixed-in cards +
 * Open House pin-to-top behavior).
 *
 * Query:
 *   pub = realtyline | newsline   (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { listFeedSocialPosts } from '@/lib/server/social-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const pubParam = req.nextUrl.searchParams.get('pub') ?? '';
  if (pubParam !== 'realtyline' && pubParam !== 'newsline') {
    return NextResponse.json({ posts: [] });
  }

  const rows = await listFeedSocialPosts(pubParam);

  // Trim to the public-safe surface; no created_by, no internal timestamps
  // beyond posted_at.
  const posts = rows.map((p) => ({
    id: p.id,
    fb_post_id: p.fb_post_id,
    permalink_url: p.permalink_url,
    message: p.message,
    image_url: p.image_url,
    posted_at: p.posted_at,
    is_open_house: p.is_open_house,
    display_order: p.display_order,
  }));

  return NextResponse.json({ posts });
});
