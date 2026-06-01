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
