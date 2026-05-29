/**
 * /api/ads/active  GET
 *
 * Returns the active ad creative for the requested slot + publication.
 * Used by the public web app via <AdSlot> to render any ad unit.
 *
 * Query:
 *   slot = <ad_space_slug>  (e.g. featured_builder_strip, feed_sticky_bottom,
 *          calendar_event_sponsor, giveaway_prize_sponsor, newsletter_banner)
 *          Legacy aliases also accepted: leaderboard, rectangle, popup,
 *          feed_top, calendar_top.
 *   pub  = realtyline | newsline
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { getActiveCampaignForSlot } from '@/lib/server/ads-store';

export const runtime = 'nodejs';

// Legacy short-name aliases. New code should pass the raw ad_space slug.
const LEGACY_SLOT_ALIASES: Record<string, string> = {
  leaderboard: 'article_top_leaderboard',
  rectangle: 'article_mid_inline',
  popup: 'article_interstitial',
  feed_top: 'feed_top_banner',
  calendar_top: 'calendar_top_banner',
};

const PUB_MAP: Record<string, 'austin' | 'san_antonio'> = {
  realtyline: 'austin',
  newsline: 'san_antonio',
};

// Slugs must be lowercase letters, digits, and underscores. Belt + suspenders
// against SQL probing via the public endpoint.
const SLUG_RE = /^[a-z0-9_]+$/;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const slotParam = req.nextUrl.searchParams.get('slot') ?? '';
  const pubParam = req.nextUrl.searchParams.get('pub') ?? '';

  const dbSlot = LEGACY_SLOT_ALIASES[slotParam] ?? slotParam;
  const dbPub = PUB_MAP[pubParam];

  if (!dbSlot || !SLUG_RE.test(dbSlot) || !dbPub) {
    return NextResponse.json({ ad: null });
  }

  const campaign = await getActiveCampaignForSlot(dbSlot, dbPub);
  if (!campaign) {
    return NextResponse.json({ ad: null });
  }

  return NextResponse.json({
    ad: {
      id: campaign.id,
      slot: dbSlot,
      advertiser: campaign.creative.advertiser_name,
      image: campaign.creative.blob_url,
      width: campaign.creative.width,
      height: campaign.creative.height,
      href: campaign.creative.click_url,
      alt: campaign.creative.alt_text || campaign.creative.advertiser_name,
    },
  });
});
