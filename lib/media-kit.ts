// lib/media-kit.ts
//
// 2026 Media Kit data — Ad Packages, e-Blasts, Print Deadlines, and Policy
// notes. Verbatim port of the renderPackages() data block from the legacy
// PressBook CRM (pressbook-crm/app2.js lines 17150–17240) so the same source
// of truth drives both apps.

export interface AdSizeRate {
  size: string;
  dim: string;
  price: number;
}

export interface Package {
  id: string;
  name: string;
  term: string;
  tagline: string;
  popular?: boolean;
  premium?: boolean;
  features: string[];
  /** Empty when the package only sells the Brand[12 Plus] Full Page tier. */
  sizes: AdSizeRate[];
}

export interface EBlast {
  name: string;
  /** Default / Austin / Newsline San Antonio price (legacy single-market value). */
  price: number;
  features: string[];
  /** Default number of sends bundled in the package (Austin + Newsline = 2). */
  sends: number;
  /**
   * Optional per-publication price overrides. Used to charge market CPM rates
   * on the larger Houston (50K) and Dallas/FTW (27K) lists. When a pub key is
   * absent here, the renderer falls back to `price`.
   */
  priceByPub?: Partial<Record<MediaKitPub, number>>;
  /**
   * Optional per-publication send-count overrides. Houston and Dallas/FTW
   * bundle 1 send (CPM-priced at $0.03/sub); Austin and Newsline San Antonio
   * keep the legacy 2-send package.
   */
  sendsByPub?: Partial<Record<MediaKitPub, number>>;
  /**
   * Optional per-publication feature-list overrides. Houston/Dallas (1 send,
   * no event coverage) drop the "follow-up prior to event" bullet.
   */
  featuresByPub?: Partial<Record<MediaKitPub, string[]>>;
  /**
   * Optional whitelist of publications this package is sold on. When unset,
   * the package is available on every publication tab. Used to limit Houston
   * and Dallas/FTW to a single eblast offering (no event-coverage SKU since
   * those markets don't run live event coverage yet).
   */
  availablePubs?: Array<MediaKitPub>;
}

/** True when the eblast package should appear on the given publication tab. */
export function isEblastAvailableForPub(blast: EBlast, pub: MediaKitPub): boolean {
  if (!blast.availablePubs || blast.availablePubs.length === 0) return true;
  return blast.availablePubs.includes(pub);
}

/**
 * Resolve the eblast price for the active publication tab. Houston and
 * Dallas/FTW carry market-CPM pricing (~$100 CPM x list size); Austin and
 * Newsline San Antonio keep their legacy flat rate.
 */
export function eblastPriceForPub(blast: EBlast, pub: MediaKitPub): number {
  return blast.priceByPub?.[pub] ?? blast.price;
}

/** Resolve the bundled-send count for the active publication tab. */
export function eblastSendsForPub(blast: EBlast, pub: MediaKitPub): number {
  return blast.sendsByPub?.[pub] ?? blast.sends;
}

/** Resolve the feature-list for the active publication tab. */
export function eblastFeaturesForPub(blast: EBlast, pub: MediaKitPub): string[] {
  return blast.featuresByPub?.[pub] ?? blast.features;
}

export interface PrintDeadline {
  month: string;
  /** Space-reservation / ads-due deadline (camera-ready). */
  deadline: string;
  /** Print magazine mail date. */
  mail: string;
  /** Optional digital edition + email blast release date. */
  digitalRelease?: string;
}

export type DeadlinesPub = 'realtyline' | 'newsline';

export interface PubDeadlines {
  pub: DeadlinesPub;
  name: string;
  year: number;
  /** Empty array = deadlines not yet published for this pub. */
  rows: PrintDeadline[];
  /** Source-of-truth page users can visit to double-check dates. */
  sourceUrl?: string;
}

export interface PolicyNote {
  color: string;
  title: string;
  body: string;
}

// ── Digital / App ad slots ─────────────────────────────────────────────────
//
// The 16-slot catalog that ships with the unified <AdSlot> engine
// (June 2026). Same surface set the rate-card page in the printed Media
// Kit PDF documents, kept in sync here so the admin reference page, the
// Sign Wizard, and the generated agreement PDF all read from one source.
//
// Rates are weekly per single publication (RealtyLine OR Newsline San Antonio). Both-
// pub rates run ~1.7× single-pub for full network reach. Monthly = 4 weeks.

// A rotating slot (see `rotates` below / ROTATING_SLUGS in AdSlot.tsx) is
// shared by multiple concurrent advertisers whose creatives cross-fade in the
// UI. It is therefore only sold out once this many active bookings overlap the
// same publication + window — a single booking does not exhaust it. Non-
// rotating slots have an implicit capacity of 1. Kept here so availability
// (lib/server/slot-availability.ts) and the rate card share one source.
export const ROTATION_CAPACITY = 6;

export type AppAdSlotTier = 'standard' | 'premium';
export type AppAdSlotZone =
  | 'feed'
  | 'article'
  | 'calendar'
  | 'newsletter'
  | 'account'
  | 'app';

export interface AppAdSlot {
  /** ad_spaces.slug — keep in sync with lib/db.ts catalog. */
  slug: string;
  /** Human-readable label, used in admin UI + agreement PDF. */
  name: string;
  zone: AppAdSlotZone;
  tier: AppAdSlotTier;
  /** Weekly rate, single publication, USD. */
  weeklySingle: number;
  /** Weekly rate, both publications, USD. */
  weeklyBoth: number;
  /** Monthly rate (4 weeks), single publication, USD. null when sold per send / per push. */
  monthlySingle: number | null;
  /** Monthly rate (4 weeks), both publications, USD. null when sold per send / per push. */
  monthlyBoth: number | null;
  /** Pricing-unit override for slots that don't follow weekly cadence. */
  pricingUnit?: 'per send' | 'per push';
  /** Creative sizes shown in the spec column of the admin reference page. */
  sizes: string;
  /** One-line placement / inventory note. */
  notes: string;
  /**
   * Which publication scopes this slot can actually be booked on.
   * Defaults (when omitted) to every single-pub plus the legacy 'both'
   * bundle — see getSlotAvailablePubs() for the resolved set.
   * Set this explicitly when a placement is only sold on one publication
   * (e.g. a Newsline San Antonio-only sponsorship) or when 'both' is not packaged.
   * The checkout UI disables disallowed scopes; the server enforces the
   * same allow-list when creating the Stripe payment intent.
   */
  availablePubs?: Array<MediaKitPub>;
  /**
   * If true, this slot rotates through multiple active campaigns (up to 5)
   * client-side. Each creative dwells 6s and cross-fades over 2s into the
   * next. Implementation lives in components/ads/AdSlot.tsx via the
   * ROTATING_SLUGS set — keep these two lists in sync.
   * Used by /admin/ads/placements and /advertise/placements to surface a
   * “Rotates with other partners” badge so sales + advertisers know the
   * placement is shared with up to 4 other creatives.
   */
  rotates?: boolean;
}

// Publication scope used by the rate-card and checkout system. Mirrors
// CheckoutPub in lib/server/slot-availability.ts. Houston and Dallas
// (added Phase 2 PR D) are sold as separate single-pub buys at the same
// rate as a solo RealtyLine booking. 'both' remains the legacy Austin+SA
// bundle and is NOT extended to cover Houston/Dallas.
export type MediaKitPub =
  | 'realtyline'
  | 'newsline'
  | 'realtyline-houston'
  | 'realtyline-dallas'
  | 'both';

/**
 * Resolve the set of publication scopes a slot can be booked on. Centralized
 * so checkout UI, server-side payment-intent validation, and admin reference
 * tooling all agree on the rule. Slots with no explicit `availablePubs` are
 * assumed to be sold on every single pub plus the legacy 'both' bundle.
 * A slot whose `weeklyBoth` is 0/null is treated as single-pub only (no
 * bundle), but Houston/Dallas remain bookable.
 */
export function getSlotAvailablePubs(
  slot: AppAdSlot,
): Array<MediaKitPub> {
  if (slot.availablePubs && slot.availablePubs.length > 0) {
    return slot.availablePubs;
  }
  const singles: Array<MediaKitPub> = [
    'realtyline',
    'newsline',
    'realtyline-houston',
    'realtyline-dallas',
  ];
  if (!slot.weeklyBoth || slot.weeklyBoth <= 0) {
    return singles;
  }
  return [...singles, 'both'];
}

// ── Multi-market rate scaling ────────────────────────────────────────────
//
// Rates in APP_AD_SLOTS are stored as 1-market (single) base prices. When an
// advertiser bundles multiple markets (Austin / Newsline San Antonio / Houston / Dallas),
// we apply a linear bundle multiplier that rewards bigger commitments:
//
//   1 market  → 1.0× (base price)
//   2 markets → 1.7× (per current both-pub convention)
//   3 markets → 2.4×
//   4 markets → 3.0× (all RealtyLine network + Newsline San Antonio)
//
// This replaces the legacy `weeklyBoth`/`monthlyBoth` two-tier model. The
// stored `weeklyBoth`/`monthlyBoth` fields are kept on the AppAdSlot type for
// backward compatibility with checkout / agreement PDF code paths, but the
// Media Kit page now derives 2-market pricing from `MARKET_MULTIPLIERS` so
// 3- and 4-market upsell tiers stay perfectly in sync.
export const MARKET_MULTIPLIERS: Record<1 | 2 | 3 | 4, number> = {
  1: 1.0,
  2: 1.7,
  3: 2.4,
  4: 3.0,
};

export type MarketCount = 1 | 2 | 3 | 4;

/** Round to the nearest $5 to keep printed rates clean. */
function roundRate(n: number): number {
  return Math.round(n / 5) * 5;
}

/** Weekly price for a slot at the given market-count tier. */
export function weeklyRateForMarkets(slot: AppAdSlot, markets: MarketCount): number {
  return roundRate(slot.weeklySingle * MARKET_MULTIPLIERS[markets]);
}

/** Monthly price for a slot at the given market-count tier. Returns null when the slot has no monthly tier. */
export function monthlyRateForMarkets(slot: AppAdSlot, markets: MarketCount): number | null {
  if (slot.monthlySingle === null) return null;
  return roundRate(slot.monthlySingle * MARKET_MULTIPLIERS[markets]);
}

export const APP_AD_SLOTS: AppAdSlot[] = [
  // ---- Premium tier ----
  {
    slug: 'featured_builder_strip',
    name: 'Featured Builder Strip',
    zone: 'feed',
    tier: 'premium',
    weeklySingle: 350,
    weeklyBoth: 525,
    monthlySingle: 1400,
    monthlyBoth: 2100,
    sizes: '1200×200 desktop · 600×160 mobile',
    notes: 'Top of /builders + /inventory. Logo + tagline + CTA.',
  },
  {
    slug: 'giveaway_prize_sponsor',
    name: 'Giveaway Prize Sponsor',
    zone: 'feed',
    tier: 'premium',
    weeklySingle: 350,
    weeklyBoth: 525,
    monthlySingle: 1400,
    monthlyBoth: 2100,
    sizes: '1080×600 feed card · native entry page',
    notes: 'Per giveaway, typically 2–4 weeks. Sponsor pays prize + visibility.',
  },
  {
    rotates: true,
    slug: 'article_top_leaderboard',
    name: 'Article Top Leaderboard',
    zone: 'article',
    tier: 'premium',
    weeklySingle: 300,
    weeklyBoth: 450,
    monthlySingle: 1200,
    monthlyBoth: 1800,
    sizes: '728×90 desktop · 320×50 mobile · 300×250 fallback',
    notes: '100% of article opens, above-the-fold.',
  },
  {
    slug: 'article_interstitial',
    name: 'Article Interstitial',
    zone: 'article',
    tier: 'premium',
    weeklySingle: 300,
    weeklyBoth: 450,
    monthlySingle: 1200,
    monthlyBoth: 1800,
    sizes: '1080×1920 mobile fullscreen · 970×250 desktop',
    notes: 'Every 4th article tap; never on first session. High friction — reserved.',
  },
  {
    slug: 'article_sidebar_desktop',
    name: 'Article Sidebar (Desktop)',
    zone: 'article',
    tier: 'premium',
    weeklySingle: 275,
    weeklyBoth: 425,
    monthlySingle: 1100,
    monthlyBoth: 1700,
    sizes: '300×600 desktop · 300×250 stacked',
    notes: 'Desktop only (≥1024px). Long-dwell placement.',
  },
  {
    slug: 'calendar_event_sponsor',
    name: 'Calendar Event Sponsor',
    zone: 'calendar',
    tier: 'premium',
    weeklySingle: 275,
    weeklyBoth: 425,
    monthlySingle: 1100,
    monthlyBoth: 1700,
    sizes: 'Native event card (gold border)',
    notes: 'Pinned to top of calendar list. “Presented by” tag. 1–2 per pub per week.',
  },
  {
    slug: 'account_splash',
    name: 'Account Page Splash',
    zone: 'account',
    tier: 'premium',
    weeklySingle: 250,
    weeklyBoth: 400,
    monthlySingle: 1000,
    monthlyBoth: 1600,
    sizes: '1080×400 banner · 970×250 desktop · 320×250 mobile',
    notes: 'Top of /account + /profile, every visit. Rotates per session.',
  },
  {
    rotates: true,
    slug: 'newsletter_banner',
    name: 'e-Blast Top Banner',
    zone: 'newsletter',
    tier: 'premium',
    weeklySingle: 250,
    weeklyBoth: 400,
    monthlySingle: null,
    monthlyBoth: null,
    pricingUnit: 'per send',
    sizes: '600×200 email · 600×100 email slim',
    notes: 'Top of every send. Ships when newsletter ships.',
  },
  {
    slug: 'splash_welcome',
    name: 'Splash / Welcome',
    zone: 'app',
    tier: 'premium',
    weeklySingle: 400,
    weeklyBoth: 600,
    monthlySingle: 1600,
    monthlyBoth: 2400,
    sizes: '1080×1920 mobile fullscreen',
    notes: 'App-open moment, first session of the day. Never twice in 12h.',
  },
  {
    slug: 'push_sponsorship',
    name: 'Push Notification Sponsor',
    zone: 'app',
    tier: 'premium',
    weeklySingle: 500,
    weeklyBoth: 750,
    monthlySingle: null,
    monthlyBoth: null,
    pricingUnit: 'per push',
    sizes: '256×256 icon',
    notes: 'Max 1 sponsored push per week. Use sparingly.',
  },
  // ---- Standard tier ----
  {
    rotates: true,
    slug: 'feed_top_banner',
    name: 'Feed Top Banner',
    zone: 'feed',
    tier: 'standard',
    weeklySingle: 150,
    weeklyBoth: 225,
    monthlySingle: 600,
    monthlyBoth: 900,
    sizes: '728×90 desktop · 320×50 mobile',
    notes: 'Top of feed, both pubs.',
  },
  {
    slug: 'feed_inline_card',
    name: 'Feed Inline Card',
    zone: 'feed',
    tier: 'standard',
    weeklySingle: 125,
    weeklyBoth: 200,
    monthlySingle: 500,
    monthlyBoth: 800,
    sizes: '1080×600 native',
    notes: 'Every 6th feed card. Marked SPONSORED.',
  },
  {
    rotates: true,
    slug: 'feed_sticky_bottom',
    name: 'Feed Sticky Bottom',
    zone: 'feed',
    tier: 'standard',
    weeklySingle: 125,
    weeklyBoth: 200,
    monthlySingle: 500,
    monthlyBoth: 800,
    sizes: '320×50 mobile · 320×100 mobile large',
    notes: 'Persistent at bottom while scrolling feed. Dismissable.',
  },
  {
    slug: 'article_mid_inline',
    name: 'Article Mid-Inline',
    zone: 'article',
    tier: 'standard',
    weeklySingle: 150,
    weeklyBoth: 225,
    monthlySingle: 600,
    monthlyBoth: 900,
    sizes: '300×250 · 320×100 mobile large',
    notes: 'Inserted at 40% scroll depth on articles >600 words.',
  },
  {
    slug: 'article_bottom',
    name: 'Article Bottom',
    zone: 'article',
    tier: 'standard',
    weeklySingle: 125,
    weeklyBoth: 200,
    monthlySingle: 500,
    monthlyBoth: 800,
    sizes: '300×250 · 728×90 desktop',
    notes: '100% of article completions.',
  },
  {
    rotates: true,
    slug: 'calendar_top_banner',
    name: 'Calendar Top Banner',
    zone: 'calendar',
    tier: 'standard',
    weeklySingle: 125,
    weeklyBoth: 200,
    monthlySingle: 500,
    monthlyBoth: 800,
    sizes: '728×90 desktop · 320×50 mobile',
    notes: 'Top of calendar tab, both pubs.',
  },
];

export const APP_AD_AUDIENCE_NOTE =
  '16 ad spaces unified under <AdSlot>. PostHog ad_impression / ad_click tracking on every render. Unsold inventory auto-fills with RealtyLine House creatives.';

// ── Packages ────────────────────────────────────────────────────────────────

export const PACKAGES: Package[] = [
  {
    id: 'brand1',
    name: 'Brand [1]',
    term: 'No Agreement',
    tagline: 'Ad Creative in Print & Digital Editions Only',
    popular: false,
    features: ['Ad Creative in Print & Digital Editions'],
    sizes: [
      { size: 'Full Page',     dim: '10 × 11.0833 in',                        price: 1440 },
      { size: 'Half-Page',     dim: '10 × 5.25 in or 4.8333 × 11.0833 in',    price: 1150 },
      { size: 'Quarter-Page',  dim: '4.8333 × 5.25 in',                       price:  880 },
    ],
  },
  {
    id: 'brand3',
    name: 'Brand [3]',
    term: '3-Month Agreement',
    tagline: 'Save with a short-term commitment',
    popular: false,
    features: [
      'Ad Creative in Print & Digital Editions',
      'Event Coverage includes a Facebook LIVE',
      'Unlimited Calendar of Events Entries Online',
    ],
    sizes: [
      { size: 'Full Page',     dim: '10 × 11.0833 in',                        price: 1205 },
      { size: 'Half-Page',     dim: '10 × 5.25 in or 4.8333 × 11.0833 in',    price:  915 },
      { size: 'Quarter-Page',  dim: '4.8333 × 5.25 in',                       price:  645 },
    ],
  },
  {
    id: 'brand6',
    name: 'Brand [6]',
    term: '6-Month Agreement',
    tagline: 'Best value for growing brands',
    popular: true,
    features: [
      'Ad Creative in Print & Digital Editions',
      'Event Coverage includes a Facebook LIVE',
      'Unlimited Calendar of Events Entries Online',
      'Featured Advertiser Article',
      'Press Release Submissions',
      'Social Media Content Shares',
      'Solo e-Blast (1)',
      'Builder/Developer Inventory in Weekly e-Blast',
    ],
    sizes: [
      { size: 'Full Page',     dim: '10 × 11.0833 in',                        price: 1140 },
      { size: 'Half-Page',     dim: '10 × 5.25 in or 4.8333 × 11.0833 in',    price:  845 },
      { size: 'Quarter-Page',  dim: '4.8333 × 5.25 in',                       price:  575 },
    ],
  },
  {
    id: 'brand12',
    name: 'Brand [12]',
    term: '12-Month Agreement',
    tagline: 'Maximum exposure, maximum savings',
    popular: false,
    features: [
      'Ad Creative in Print & Digital Editions',
      'Event Coverage includes a Facebook LIVE',
      'Unlimited Calendar of Events Entries Online',
      'Featured Advertiser Article',
      'Press Release Submissions',
      'Social Media Content Shares',
      'Solo e-Blast (2)',
      'Builder/Developer Inventory in Weekly e-Blast',
    ],
    sizes: [
      { size: 'Full Page',     dim: '10 × 11.0833 in',                        price: 1050 },
      { size: 'Half-Page',     dim: '10 × 5.25 in or 4.8333 × 11.0833 in',    price:  755 },
      { size: 'Quarter-Page',  dim: '4.8333 × 5.25 in',                       price:  485 },
    ],
  },
  {
    id: 'brand12plus',
    name: 'Brand [12 Plus]',
    term: '12-Month Agreement',
    tagline: 'The ultimate premium brand presence',
    popular: false,
    premium: true,
    features: [
      'Ad Creative in Print & Digital Editions',
      'Event Coverage includes a Facebook LIVE',
      'Unlimited Calendar of Events Entries Online',
      'Featured Advertiser Article',
      'Press Release Submissions',
      'Social Media Content Shares',
      'Solo e-Blast (3)',
      'Builder/Developer Inventory in Weekly e-Blast',
      'Logo & Link — Print & Digital Front Page',
      'Logo & Link — Weekly Emails',
    ],
    sizes: [
      { size: 'Full Page', dim: '10 × 11.0833 in', price: 1680 },
    ],
  },
];

// ── e-Blasts ────────────────────────────────────────────────────────────────

// e-Blast pricing model (mixed flat + CPM):
//   - Austin (RealtyLine, 39K): flat $1,100 / $1,425 packages. Each package
//     = 2 sends. Pkg 2 adds event-day coverage. Both packages offered.
//   - Newsline San Antonio (14K): single CPM-priced package, no event
//     coverage. $0.05/sub x 2 sends = $1,400. Pkg 1 only.
//   - Houston (50K) + Dallas/FTW (27K): $0.05/sub x 1 send per package.
//     Pkg 1 only - no event-coverage SKU.
//
//   Austin pkg 1 (2 sends):       $1,100  (flat)
//   Austin pkg 2 (2 sends + ev):  $1,425  (flat)
//   Newsline pkg 1 (2 sends):     14,000 x $0.05 x 2 = $1,400
//   Houston pkg 1 (1 send):       50,000 x $0.05 = $2,500
//   Dallas/FTW pkg 1 (1 send):    27,000 x $0.05 = $1,350
export const EBLASTS: EBlast[] = [
  {
    name: 'e-Blast Package No. 1',
    // Default price falls back to the Austin (RealtyLine) rate. Non-pub-aware
    // callers see the Austin number until they use eblastPriceForPub().
    // 2026 rates from the printed media kit.
    price: 1099,
    sends: 2,
    priceByPub: {
      'realtyline':         1099,  // Austin (44K+ subs)
      'newsline':            492,  // SA     (20K+ subs)
      'both':               1432,  // Austin + Newsline bundle (10% off)
      'realtyline-houston': 2500,  // Houston (50K x $0.05 x 1) — launching soon
      'realtyline-dallas':  1350,  // Dallas  (27K x $0.05 x 1) — launching soon
    },
    sendsByPub: {
      'realtyline-houston': 1,
      'realtyline-dallas':  1,
    },
    features: [
      'Exclusive e-Blast',
      'One Complimentary Follow-up e-Blast**',
      'Included in One Weekly e-Blast (Friday)',
    ],
    // Houston + Dallas/FTW bundle a single send with no event-coverage
    // follow-up, so the feature list drops the second-send bullet.
    featuresByPub: {
      'realtyline-houston': [
        'Exclusive e-Blast',
        'Included in One Weekly e-Blast (Friday)',
      ],
      'realtyline-dallas': [
        'Exclusive e-Blast',
        'Included in One Weekly e-Blast (Friday)',
      ],
    },
  },
  {
    name: 'e-Blast Package No. 2',
    // Pkg 2 (event-coverage) is sold on Austin, Newsline SA, and the
    // Austin + Newsline bundle. Houston + Dallas/FTW sell Pkg 1 only.
    price: 1449,
    sends: 2,
    priceByPub: {
      'realtyline': 1449,  // Austin
      'newsline':    842,  // Newsline SA
      'both':       2062,  // Bundle (10% off)
    },
    availablePubs: ['realtyline', 'newsline', 'both'],
    features: [
      'Exclusive e-Blast',
      'Up to Two Complimentary Follow-up e-Blasts**',
      'Included in Two Weekly e-Blasts (Friday)',
      'Day of Event Coverage*',
      'Up to four images published to Facebook, Instagram & website',
      'Company name & event details included in post',
    ],
  },
];

// ── Print Deadlines (2026) ─────────────────────────────────────────────────

// Source of truth for RealtyLine 2026 dates:
// https://realtyline.us/2026-deadlines-2/
// Verified against WordPress editor 2026-08-21.
const REALTYLINE_2026: PrintDeadline[] = [
  { month: 'January',   deadline: 'January 7',    mail: 'January 21',    digitalRelease: 'January 16'   },
  { month: 'February',  deadline: 'February 5',   mail: 'February 20',   digitalRelease: 'February 16'  },
  { month: 'March',     deadline: 'March 5',      mail: 'March 23',      digitalRelease: 'March 16'     },
  { month: 'April',     deadline: 'April 7',      mail: 'April 23',      digitalRelease: 'April 15'     },
  { month: 'May',       deadline: 'May 6',        mail: 'May 22',        digitalRelease: 'May 15'       },
  { month: 'June',      deadline: 'June 5',       mail: 'June 22',       digitalRelease: 'June 16'      },
  { month: 'July',      deadline: 'July 8',       mail: 'July 23',       digitalRelease: 'July 16'      },
  { month: 'August',    deadline: 'August 5',     mail: 'August 21',     digitalRelease: 'August 14'    },
  { month: 'September', deadline: 'September 9',  mail: 'September 22',  digitalRelease: 'September 16' },
  { month: 'October',   deadline: 'October 7',    mail: 'October 23',    digitalRelease: 'October 16'   },
  { month: 'November',  deadline: 'November 6',   mail: 'November 23',   digitalRelease: 'November 16'  },
  { month: 'December',  deadline: 'December 9',   mail: 'December 21',   digitalRelease: 'December 18'  },
];

// Newsline San Antonio publishes on the same 2026 print / digital
// calendar as RealtyLine.  Alias the RealtyLine array so future
// corrections only need to touch REALTYLINE_2026.
const NEWSLINE_2026: PrintDeadline[] = REALTYLINE_2026;

export const PRINT_DEADLINES_BY_PUB: Record<DeadlinesPub, PubDeadlines> = {
  realtyline: {
    pub: 'realtyline',
    name: 'RealtyLine',
    year: 2026,
    rows: REALTYLINE_2026,
    sourceUrl: 'https://realtyline.us/2026-deadlines-2/',
  },
  newsline: {
    pub: 'newsline',
    name: 'Newsline San Antonio',
    year: 2026,
    rows: NEWSLINE_2026,
  },
};

// Legacy alias for existing callers that still expect a bare 2026
// RealtyLine list (app/(public)/advertise/print/page.tsx, admin
// media-kit reference, availability calendar).  Do not remove
// without updating those callers.
export const PRINT_DEADLINES: PrintDeadline[] = REALTYLINE_2026;

// ── Rate matrix (Size × Frequency) ─────────────────────────────────────────

export const RATE_MATRIX: Record<string, [number, number, number, number]> = {
  // [1x, 3x, 6x, 12x] per month
  'Full Page':    [1440, 1205, 1140, 1050],
  'Half-Page':    [1150,  915,  845,  755],
  'Quarter-Page': [ 880,  645,  575,  485],
};

export const FREQ_LABELS: [string, string, string, string] = ['1x', '3x', '6x', '12x'];
export const FREQ_TERMS:  [string, string, string, string] = [
  'No Agreement', '3-Month', '6-Month', '12-Month',
];

// Brand[12 Plus] is a separate premium tier — Full Page only at $1,680/mo
export const BRAND_12_PLUS_RATE = 1680;

// ── Audience stats (RealtyLine) ────────────────────────────────────────────

export interface AudienceStat {
  label: string;
  value: string;
}

export interface PubAudienceStats {
  pub: MediaKitPub;
  name: string;
  stats: AudienceStat[];
}

// Per-publication stats sourced from the 2026 Media Kit PDF.
// Verified human engagement — Apple MPP and bot activity filtered from
// open-rate reporting since June 2024.
export const AUDIENCE_STATS_BY_PUB: PubAudienceStats[] = [
  {
    pub: 'realtyline',
    name: 'RealtyLine Austin',
    stats: [
      { label: 'Print Copies',  value: '16.5K+'  },
      { label: 'Subscribers',   value: '44K+'    },
      { label: 'Annual Sends',  value: '6.64M+'  },
      { label: 'Email Opens',   value: '204K+'   },
      { label: 'Annual Clicks', value: '21K+'    },
      { label: 'Open Rate',     value: '3.1%'    },
      { label: 'Click Rate',    value: '0.32%'   },
      { label: 'Clicks/Opens',  value: '10.4%'   },
    ],
  },
  {
    pub: 'newsline',
    name: 'Newsline San Antonio',
    stats: [
      { label: 'Print Copies',  value: '10K+'    },
      { label: 'Subscribers',   value: '20K+'    },
      { label: 'Annual Sends',  value: '156.7K+' },
      { label: 'Email Opens',   value: '6.78K+'  },
      { label: 'Annual Clicks', value: '393+'    },
      { label: 'Open Rate',     value: '4.4%'    },
      { label: 'Click Rate',    value: '0.26%'   },
      { label: 'Clicks/Opens',  value: '5.8%'    },
    ],
  },
];

// Backwards-compat aggregate — some pages import AUDIENCE_STATS directly.
export const AUDIENCE_STATS: AudienceStat[] = [
  { label: 'Subscribers',    value: '141K+' },
  { label: 'Avg Open Rate',  value: '3.5%'  },
  { label: 'Avg Click Rate', value: '0.30%' },
];

// ── Launching-soon gating ────────────────────────────────────────────────
// Single source of truth for which markets are pre-launch. Any UI that iterates
// MediaKitPub should filter through this so pricing, slot inventory, and public
// checkout stay in sync with the Expansion section.

export const LAUNCHING_SOON_PUBS: ReadonlySet<MediaKitPub> = new Set<MediaKitPub>([
  'realtyline-houston',
  'realtyline-dallas',
]);

export function isLaunchingSoon(pub: MediaKitPub): boolean {
  return LAUNCHING_SOON_PUBS.has(pub);
}

export function isLive(pub: MediaKitPub): boolean {
  return !LAUNCHING_SOON_PUBS.has(pub);
}

// ── Network expansion — publications by launch status ────────────────────

export type ExpansionStatus = 'active' | 'launching-soon';

export interface ExpansionPub {
  name: string;
  channels: string;
  status: ExpansionStatus;
}

export const EXPANSION_PUBS: ExpansionPub[] = [
  { name: 'RealtyLine Austin',       channels: 'Print, Digital, Email, Mobile', status: 'active'          },
  { name: 'Newsline San Antonio',    channels: 'Print, Digital, Email, Mobile', status: 'active'          },
  { name: 'RealtyLine Houston',      channels: 'Digital, Email, Mobile',        status: 'launching-soon' },
  { name: 'RealtyLine Dallas / FTW', channels: 'Digital, Email, Mobile',        status: 'launching-soon' },
];

// Per-publication subscriber counts. Used by the Media Kit page so each tab
// reflects the actual list size for that market. Totals: 130K across all four
// markets (Austin 39K + Houston 50K + Dallas/Ft. Worth 27K + San Antonio 14K,
// where San Antonio rolls under the RealtyLine Austin umbrella).
export const PUB_SUBSCRIBERS: Record<MediaKitPub, number> = {
  'realtyline':          44000, // RealtyLine Austin (2026 media kit)
  'newsline':            20000, // Newsline San Antonio (2026 media kit)
  'realtyline-houston':  50000,
  'realtyline-dallas':   27000,
  'both':                64000, // Active markets only: 44K Austin + 20K Newsline SA (Houston + Dallas launching soon)
};

// ── Policy notes ───────────────────────────────────────────────────────────

export const POLICY_NOTES: PolicyNote[] = [
  {
    color: '#dc2626',
    title: 'Ad Rates',
    body: 'Ad rates are based on CONSECUTIVE MONTHS and agreement must be signed in advance to receive frequency discounts.',
  },
  {
    color: '#f97316',
    title: 'Premium Position Guarantees',
    body: 'A 20% premium fee applies to inside front cover, page 3, inside back cover, center-spread, and back page.',
  },
  {
    color: '#dc2626',
    title: 'Cancellation Notice',
    body: 'All cancellations must be made in writing within 30 days of the stated advertising deadline. If not timely canceled, ad space will continue to be reserved, ad copy will pick up from the previous month, and the advertiser is responsible for payment at the open rate until a final written cancellation is received or a new agreement is executed.',
  },
];
