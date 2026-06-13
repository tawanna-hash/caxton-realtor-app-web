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
  price: number;
  features: string[];
}

export interface PrintDeadline {
  month: string;
  deadline: string;
  mail: string;
}

export interface PolicyNote {
  color: string;
  title: string;
  body: string;
}

// ── Digital / App ad slots ─────────────────────────────────────────────────
//
// The 17-slot catalog that ships with the unified <AdSlot> engine
// (June 2026). Same surface set the rate-card page in the printed Media
// Kit PDF documents, kept in sync here so the admin reference page, the
// Sign Wizard, and the generated agreement PDF all read from one source.
//
// Rates are weekly per single publication (RealtyLine OR Newsline). Both-
// pub rates run ~1.7× single-pub for full network reach. Monthly = 4 weeks.

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
   * Defaults to ['realtyline', 'newsline', 'both'] when omitted (all three),
   * which is the historical assumption for every slot in this file.
   * Set this explicitly when a placement is only sold on one publication
   * (e.g. a Newsline-only sponsorship) or when 'both' is not packaged.
   * The checkout UI disables disallowed scopes; the server enforces the
   * same allow-list when creating the Stripe payment intent.
   */
  availablePubs?: Array<'realtyline' | 'newsline' | 'both'>;
}

/**
 * Resolve the set of publication scopes a slot can be booked on. Centralized
 * so checkout UI, server-side payment-intent validation, and admin reference
 * tooling all agree on the rule. Slots with no explicit `availablePubs` are
 * assumed to be sold on either single pub OR both, matching the historical
 * default. A slot whose `weeklyBoth` is 0/null is treated as single-pub only.
 */
export function getSlotAvailablePubs(
  slot: AppAdSlot,
): Array<'realtyline' | 'newsline' | 'both'> {
  if (slot.availablePubs && slot.availablePubs.length > 0) {
    return slot.availablePubs;
  }
  const both: Array<'realtyline' | 'newsline' | 'both'> = [
    'realtyline',
    'newsline',
    'both',
  ];
  if (!slot.weeklyBoth || slot.weeklyBoth <= 0) {
    return ['realtyline', 'newsline'];
  }
  return both;
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
    slug: 'newsletter_banner',
    name: 'Newsletter Banner',
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
  '17 ad spaces unified under <AdSlot>. PostHog ad_impression / ad_click tracking on every render. Unsold inventory auto-fills with RealtyLine House creatives.';

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

export const EBLASTS: EBlast[] = [
  {
    name: 'e-Blast Package No. 1',
    price: 750,
    features: [
      'Exclusive e-Blast',
      'One follow-up e-Blast prior to event',
      'Included in Weekly e-Blast (Friday)',
    ],
  },
  {
    name: 'e-Blast Package No. 2',
    price: 1050,
    features: [
      'Exclusive e-Blast',
      'Up to two follow-up e-Blasts prior to event',
      'Included in Weekly e-Blast (Friday)',
      'Day of Event Coverage',
      'Up to four images published to Facebook, Instagram & website',
    ],
  },
];

// ── Print Deadlines (2026) ─────────────────────────────────────────────────

export const PRINT_DEADLINES: PrintDeadline[] = [
  { month: 'January',   deadline: 'January 12',    mail: 'January 20'   },
  { month: 'February',  deadline: 'February 5',    mail: 'February 20'  },
  { month: 'March',     deadline: 'March 5',       mail: 'March 20'     },
  { month: 'April',     deadline: 'April 7',       mail: 'April 20'     },
  { month: 'May',       deadline: 'May 6',         mail: 'May 20'       },
  { month: 'June',      deadline: 'June 5',        mail: 'June 20'      },
  { month: 'July',      deadline: 'July 8',        mail: 'July 21'      },
  { month: 'August',    deadline: 'August 5',      mail: 'August 20'    },
  { month: 'September', deadline: 'September 9',   mail: 'September 20' },
  { month: 'October',   deadline: 'October 7',     mail: 'October 20'   },
  { month: 'November',  deadline: 'November 6',    mail: 'November 20'  },
  { month: 'December',  deadline: 'December 9',    mail: 'December 19'  },
];

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

export const AUDIENCE_STATS: { label: string; value: string }[] = [
  { label: 'Subscribers',    value: '93K'   },
  { label: 'Avg Open Rate',  value: '3.3%'  },
  { label: 'Avg Click Rate', value: '0.66%' },
];

// ── Policy notes ───────────────────────────────────────────────────────────

export const POLICY_NOTES: PolicyNote[] = [
  {
    color: '#D22531',
    title: 'Ad Rates',
    body: 'Ad rates are based on CONSECUTIVE MONTHS and agreement must be signed in advance to receive frequency discounts.',
  },
  {
    color: '#F59E0B',
    title: 'Premium Position Guarantees',
    body: 'A 20% premium fee applies to inside front cover, page 3, inside back cover, center-spread, and back page.',
  },
  {
    color: '#DB1924',
    title: 'Cancellation Notice',
    body: 'All cancellations must be made in writing within 30 days of the stated advertising deadline. If not timely canceled, ad space will continue to be reserved, ad copy will pick up from the previous month, and the advertiser is responsible for payment at the open rate until a final written cancellation is received or a new agreement is executed.',
  },
];
