// lib/scrapers/drees-promotions.ts
//
// Drees Homes — Promotions scraper (100% rebuild).
//
// Conforms to docs/promotion-scraper-template.md.
//
// Unlike M/I Homes (which has public incentive pages to scrape), Drees does
// NOT publish promotions on a public API or offers page. Their promotions
// are distributed as flyer PDFs to realtor partners. This scraper uses a
// config array of known Drees promotions — each carrying the verbatim
// marketing copy, lifecycle dates, flyer URL, and promoType classification.
//
// When Drees releases a new promotion, add a new entry to DREES_PROMOTIONS
// below. The cron route upserts by externalId, auto-publishes verbatim
// builder copy, and never re-activates a 'rejected' row.
//
// Two files:
//   lib/scrapers/drees-promotions.ts          (this file — data layer)
//   app/api/cron/scrape-drees-promotions/route.ts  (cron endpoint)

import type { UpsertScrapedInput, PromoType } from '../builder-inventory';
import { isPromotionExpired } from './promotion-utils';

const SCRAPER_SUBMITTER_NAME = 'Drees Homes Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-drees-promotions@harmonyone.system';

type DreesPromotionConfig = {
  externalId: string;
  title: string;
  description: string;
  promoType: PromoType;
  startsAt: string | null;
  expiresAt: string | null;
  flyerPdfUrl: string;
  thumbnailUrl: string;
  sourceUrl: string | null;
  communityName: string | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Known Drees Homes promotions
// ─────────────────────────────────────────────────────────────────────────
//
// Each entry maps to ONE builder_inventory row with kind='promotion'.
// The flyerPdfUrl + thumbnailUrl are Vercel Blob URLs from the manually-
// uploaded assets (preserved across upserts). The description is verbatim
// builder marketing copy — safe to auto-publish (promotion-scraper-template §9).

const DREES_PROMOTIONS: DreesPromotionConfig[] = [
  {
    externalId: 'drees-realtor-rewards-2026',
    title: '2026 REALTOR REWARDS PROGRAM EARN MORE WITH DREES CUSTOM HOMES',
    description:
      "Don't leave money on the table!\n" +
      'Drees truly values the relationships we have developed with our Realtor partners. ' +
      "That's why we want you to make the most of your selling. With Drees Custom Homes, " +
      "you'll earn 4% commission on ALL sales from June 1 to September 30, 2026*.",
    promoType: 'broker_bonus',
    startsAt: '2026-06-01',
    expiresAt: '2026-09-30',
    flyerPdfUrl:
      'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-flyers/1781197900454-zw70fexr-drees-custom-homes.pdf',
    thumbnailUrl:
      'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-thumbs/653/Screenshot%202026-06-11%20at%2012.12.37%E2%80%AFPM-2sxhiu6QyGukVuVcFLFi4TSO8HvxSa.png',
    sourceUrl: null,
    communityName: null,
  },
  {
    externalId: 'drees-cool-homes-hot-deals-2026',
    title: 'COOL HOMES HOT DEALS',
    description:
      "The home you've had your eye on is looking even better this month with great financing options! " +
      "Don't miss our 3/2/1 Buydown promotion that could save you big on your monthly payments.\n\n" +
      'HOW DOES A 3/2/1 BUYDOWN WORK?\n\n' +
      'YEAR 1: Enjoy payments based on an interest rate\n' +
      '3% lower, 3.49% / (6.578% APR) than your locked-in rate.\n\n' +
      'YEAR 2: Your rate is 2% lower, 4.49% / (6.578% APR)\n' +
      'helping you save on your mortgage payment.\n\n' +
      'YEAR 3: Your rate is 1% lower, 5.49% / (6.578% APR)\n' +
      'keeping your monthly payments low.\n\n' +
      'YEAR 4-30: Continue with your locked-in rate\n' +
      'of 6.49% / (6.578% APR), ensuring predictable payments.\n\n' +
      "With stunning designs, flexible living spaces, and homes\n" +
      "ready now; there's never been a better time to take the\n" +
      'next step. Hurry, this promotion ends July 31!',
    promoType: 'rate_buydown',
    startsAt: null,
    expiresAt: '2026-07-31',
    flyerPdfUrl:
      'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-flyers/1784926703437-k2dsga0i-drees-homes.pdf',
    thumbnailUrl:
      'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-thumbs/1784926703437-k2dsga0i-drees-homes.jpg',
    sourceUrl: null,
    communityName: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export type DreesPromotionRow = UpsertScrapedInput;

export function getDreesPromotions(): {
  rows: DreesPromotionRow[];
  rawCount: number;
} {
  const rows: DreesPromotionRow[] = DREES_PROMOTIONS.map((p) => ({
    externalId: p.externalId,
    kind: 'promotion' as const,
    publication: 'realtyline' as const,
    submittedByName: SCRAPER_SUBMITTER_NAME,
    submittedByEmail: SCRAPER_SUBMITTER_EMAIL,
    builderName: 'Drees Homes',
    title: p.title,
    city: 'Greater Austin',
    state: 'TX',
    description: p.description,
    promoType: p.promoType,
    startsAt: p.startsAt,
    expiresAt: p.expiresAt,
    flyerPdfUrl: p.flyerPdfUrl,
    thumbnailUrl: p.thumbnailUrl,
    sourceUrl: p.sourceUrl,
    galleryUrls: null,
    communityName: p.communityName,
    homeType: null,
    bedsMin: null,
    bedsMax: null,
    bathsMin: null,
    bathsMax: null,
    sqftMin: null,
    sqftMax: null,
    priceMin: null,
    priceMax: null,
    address: null,
    readyDate: null,
    planName: null,
    extraDetails: null,
  }));

  // Filter out expired promotions — don't upsert, let prune handle deletion.
  const activeRows = rows.filter((r) => !isPromotionExpired(r.expiresAt as string | null));

  return { rows: activeRows, rawCount: activeRows.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Claim helper — set external_id on manually-entered rows so upserts
// find and update them instead of creating duplicates.
// ─────────────────────────────────────────────────────────────────────────

export const DREES_PROMOTION_CLAIMS: { externalId: string; title: string }[] =
  DREES_PROMOTIONS.map((p) => ({
    externalId: p.externalId,
    title: p.title,
  }));
