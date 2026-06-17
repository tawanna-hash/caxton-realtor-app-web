/**
 * /api/ads/active  GET
 *
 * Returns the active ad creative(s) for the requested slot + publication.
 * Used by the public web app via <AdSlot> to render any ad unit.
 *
 * Query:
 *   slot  = <ad_space_slug>  (e.g. featured_builder_strip, feed_sticky_bottom,
 *           calendar_event_sponsor, giveaway_prize_sponsor, newsletter_banner)
 *           Legacy aliases also accepted: leaderboard, rectangle, popup,
 *           feed_top, calendar_top.
 *   pub   = realtyline | newsline
 *   multi = "1" to return up to N creatives for client-side rotation.
 *           Default response shape is { ad: <single | null> } for back-compat.
 *           With multi=1 the response is { ads: <array> } (may be empty).
 *   limit = optional integer 1-20, only honored with multi=1. Default 5.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import {
  getActiveCampaignForSlot,
  getActiveCampaignsForSlot,
} from '@/lib/server/ads-store';

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

type CampaignRow = {
  id: string;
  creative: {
    advertiser_name: string;
    width: number | null;
    height: number | null;
    click_url: string;
    alt_text: string | null;
  };
};

function shapeAd(slot: string, campaign: CampaignRow) {
  return {
    id: campaign.id,
    slot,
    advertiser: campaign.creative.advertiser_name,
    // Route through same-origin proxy so URLs don't contain `/ads/`
    // which trips ad-blocker filters. See app/c/[id]/route.ts.
    image: `/c/${campaign.id}`,
    width: campaign.creative.width,
    height: campaign.creative.height,
    href: campaign.creative.click_url,
    alt: campaign.creative.alt_text || campaign.creative.advertiser_name,
  };
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const slotParam = req.nextUrl.searchParams.get('slot') ?? '';
  const pubParam = req.nextUrl.searchParams.get('pub') ?? '';
  const multiParam = req.nextUrl.searchParams.get('multi') === '1';
  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '5');

  const dbSlot = LEGACY_SLOT_ALIASES[slotParam] ?? slotParam;
  const dbPub = PUB_MAP[pubParam];

  if (!dbSlot || !SLUG_RE.test(dbSlot) || !dbPub) {
    return multiParam
      ? NextResponse.json({ ads: [] })
      : NextResponse.json({ ad: null });
  }

  if (multiParam) {
    const limit = Number.isFinite(limitParam) ? limitParam : 5;
    const campaigns = await getActiveCampaignsForSlot(dbSlot, dbPub, limit);
    return NextResponse.json({
      ads: campaigns.map((c) => shapeAd(dbSlot, c)),
    });
  }

  const campaign = await getActiveCampaignForSlot(dbSlot, dbPub);
  if (!campaign) {
    return NextResponse.json({ ad: null });
  }

  return NextResponse.json({ ad: shapeAd(dbSlot, campaign) });
});
