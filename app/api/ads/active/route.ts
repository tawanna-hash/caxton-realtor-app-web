/**
 * /api/ads/active  GET
 *
 * Returns the active ad creative for the requested slot + publication.
 * Used by the public web app to render in-article and feed-level ad units.
 *
 * Query:
 *   slot = leaderboard | rectangle | popup | feed_top | calendar_top
 *   pub  = realtyline | newsline
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { getActiveCampaignForSlot } from '@/lib/server/ads-store';

export const runtime = 'nodejs';

const SLOT_MAP: Record<string, string> = {
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

export const GET = withErrorHandling(async (req: NextRequest) => {
  const slotParam = req.nextUrl.searchParams.get('slot') ?? '';
  const pubParam = req.nextUrl.searchParams.get('pub') ?? '';

  const dbSlot = SLOT_MAP[slotParam];
  const dbPub = PUB_MAP[pubParam];

  if (!dbSlot || !dbPub) {
    return NextResponse.json({ ad: null });
  }

  const campaign = await getActiveCampaignForSlot(dbSlot, dbPub);
  if (!campaign) {
    return NextResponse.json({ ad: null });
  }

  return NextResponse.json({
    ad: {
      id: campaign.id,
      image: campaign.creative.blob_url,
      href: campaign.creative.click_url,
      alt: campaign.creative.alt_text || campaign.creative.advertiser_name,
    },
  });
});
