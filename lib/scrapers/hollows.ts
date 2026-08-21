// lib/scrapers/hollows.ts
//
// The Hollows at Lake Travis (developer) — Quick Move-In (QMI) homes scraper.
//
// Source: hollowslaketravis.com/available-homes/ — a WordPress page that
// server-renders all Quick Move-In Homes into `<div class="hollows-home-card">`
// tiles with data-* attributes. Each card carries:
//
//   data-bedrooms      → bedsMin/Max
//   data-bathrooms     → bathsMin/Max
//   data-price         → priceMin/Max (integer dollars)
//   data-sqft          → sqftMin/Max
//   data-builder       → slug ("giddens", "drees", "silverton", "younger")
//   data-neighborhood  → slug ("sanctuary", "canyons")
//   data-under-contract
//
// Plus inner-text:
//   <span class="hollows-collection-tag">    → EXACT builder display name
//   <span class="hollows-badge-subtitle">    → plan name ("Montecito III Plan")
//   <h3 class="hollows-home-title">          → street address
//   <span class="hollows-price-amount">      → "$790,000" (fallback for price)
//   <img src="…">                            → thumbnail
//   <a href=".../markethomes/<slug>/">       → detail URL (externalId source)
//   stat items                               → half-bath / garages / stories
//
// Everything we need is on the listing page — per-home detail pages are
// gated by Cloudflare and don't add fields we don't already have, so we
// do NOT fetch them (matches template pitfall guidance).
//
// The page has two sections: "Quick Move-In Homes" (live QMI, the ones
// buyers can transact on) and "Coming Soon" (empty lots + specs
// pending). We scrape only the QMI section — that's what the user
// requested and it's what has real prices/sqft.
//
// Multi-builder attribution (mirrors santa-rita-ranch pattern):
//   - `builderName` = actual homebuilder per card ("Drees Custom Homes",
//     "Giddens Homes", "Silverton Custom Homes", "Younger Homes") so
//     each home surfaces on the correct /builders/<slug> page.
//   - `developerName` = "The Hollows at Lake Travis" so all homes group
//     on the developer hub.
//   - `communityName` = "The Hollows at Lake Travis · <Neighborhood>"
//     for the UI grouping.

import type { UpsertScrapedInput } from '../builder-inventory';

const ORIGIN = 'https://hollowslaketravis.com';
const LIST_URL = `${ORIGIN}/available-homes/`;

const DEVELOPER_NAME = 'The Hollows at Lake Travis';
const CITY_DEFAULT = 'Jonestown';
const STATE_DEFAULT = 'TX';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: ORIGIN + '/',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// HTML utilities (regex, no cheerio — matches SRR / MI style)
// ─────────────────────────────────────────────────────────────────────────

function decodeEntities(x: string): string {
  return x
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8211;/g, '\u2013')
    .replace(/&#8212;/g, '\u2014')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function collapse(x: string | null | undefined): string | null {
  if (!x) return null;
  const s = decodeEntities(x).replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}

function getDataAttr(html: string, name: string): string | null {
  const m = new RegExp(`data-${name}="([^"]*)"`).exec(html);
  return m ? m[1] : null;
}

function between(html: string, start: string, end: string): string | null {
  const re = new RegExp(
    start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '([\\s\\S]*?)' +
      end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const m = re.exec(html);
  return m ? m[1] : null;
}

function parseIntOrNull(x: string | null | undefined): number | null {
  if (!x) return null;
  const n = parseInt(x.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────
// Address parsing — split "4828 Destination Way, Jonestown, TX 78645" into
// street / city / state / zip. Some Hollows listings write "Texas" instead
// of "TX" (e.g. 6513 Lavish Bend). Normalize to two-letter.
// ─────────────────────────────────────────────────────────────────────────

type ParsedAddress = {
  street: string | null;
  city: string;
  state: string;
  zip: string | null;
  full: string;
};

function parseAddress(raw: string | null): ParsedAddress | null {
  if (!raw) return null;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const street = parts[0] || null;
  const city = parts[1] || CITY_DEFAULT;

  let state = STATE_DEFAULT;
  let zip: string | null = null;
  if (parts[2]) {
    // "TX 78645" or "Texas 78645"
    const m = /^([A-Za-z]+)\s*(\d{5})?/.exec(parts[2]);
    if (m) {
      const s = m[1].toLowerCase();
      state = s === 'texas' ? 'TX' : m[1].toUpperCase().slice(0, 2);
      zip = m[2] ?? null;
    }
  }
  const full = [street, city, `${state}${zip ? ' ' + zip : ''}`]
    .filter(Boolean)
    .join(', ');
  return { street, city, state, zip, full };
}

// ─────────────────────────────────────────────────────────────────────────
// externalId — derive from the /markethomes/<slug>/ detail URL. This is
// stable across runs (same address = same slug).
// ─────────────────────────────────────────────────────────────────────────

function externalIdFromDetailUrl(url: string | null): string | null {
  if (!url) return null;
  const m = /\/markethomes\/([^/?#]+)/i.exec(url);
  return m ? `hollows/${m[1]}` : null;
}

// ─────────────────────────────────────────────────────────────────────────
// QMI section slicing — the page has "Quick Move-In Homes" (real) and
// "Coming Soon" (empty lots / TBD). We only scrape QMI.
// ─────────────────────────────────────────────────────────────────────────

function extractQmiSection(fullHtml: string): string | null {
  const startMarker = 'Quick Move-In Homes</h2>';
  const endMarker = 'Coming Soon</h2>';
  const start = fullHtml.indexOf(startMarker);
  if (start === -1) return null;
  const end = fullHtml.indexOf(endMarker, start);
  return end === -1 ? fullHtml.slice(start) : fullHtml.slice(start, end);
}

// ─────────────────────────────────────────────────────────────────────────
// Card parsing
// ─────────────────────────────────────────────────────────────────────────

type ParsedCard = {
  externalId: string;
  detailUrl: string;
  builderName: string;
  planName: string | null;
  address: ParsedAddress;
  beds: number | null;
  baths: number | null;
  halfBaths: number | null;
  sqft: number | null;
  price: number | null;
  garages: number | null;
  stories: number | null;
  thumbnailUrl: string | null;
  neighborhood: string | null;
  underContract: boolean;
};

function parseCard(html: string): { card: ParsedCard | null; reason?: string } {
  const hrefMatch = /href="(https:\/\/hollowslaketravis\.com\/markethomes\/[^"]+)"/.exec(html);
  const detailUrl = hrefMatch ? hrefMatch[1] : null;
  const externalId = externalIdFromDetailUrl(detailUrl);
  if (!detailUrl || !externalId) {
    return { card: null, reason: 'no detail URL / externalId' };
  }

  const builderDisplay = collapse(
    between(html, '<span class="hollows-collection-tag">', '</span>'),
  );
  const builderSlug = getDataAttr(html, 'builder');
  const builderName =
    builderDisplay || (builderSlug ? humanizeSlug(builderSlug) : null);
  if (!builderName) {
    return { card: null, reason: 'no builder name' };
  }

  const rawAddress = collapse(
    between(html, '<h3 class="hollows-home-title">', '</h3>'),
  );
  const address = parseAddress(rawAddress);
  if (!address) {
    return { card: null, reason: 'no address' };
  }

  const planName =
    collapse(between(html, '<span class="hollows-badge-subtitle">', '</span>')) ??
    null;

  const beds = parseIntOrNull(getDataAttr(html, 'bedrooms'));
  const baths = parseIntOrNull(getDataAttr(html, 'bathrooms'));
  const sqft = parseIntOrNull(getDataAttr(html, 'sqft'));
  const price = parseIntOrNull(getDataAttr(html, 'price'));

  const statNumber = (label: string): number | null => {
    const re = new RegExp(
      '<span class="hollows-stat-number">([^<]+)</span>\\s*<span class="hollows-stat-label">' +
        label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '</span>',
    );
    const m = re.exec(html);
    return m ? parseIntOrNull(m[1]) : null;
  };
  const halfBaths = statNumber('Half Bath');
  const garages = statNumber('Garages');
  const stories = statNumber('Stories');

  const imgMatch =
    /<img[^>]*src="(https:\/\/hollowslaketravis\.com\/wp-content\/uploads\/[^"]+)"/.exec(
      html,
    );
  const thumbnailUrl = imgMatch ? imgMatch[1] : null;

  const neighborhoodSlug = getDataAttr(html, 'neighborhood');
  const neighborhood = neighborhoodSlug ? humanizeSlug(neighborhoodSlug) : null;

  const underContract = getDataAttr(html, 'under-contract') === '1';

  return {
    card: {
      externalId,
      detailUrl,
      builderName,
      planName,
      address,
      beds,
      baths,
      halfBaths,
      sqft,
      price,
      garages,
      stories,
      thumbnailUrl,
      neighborhood,
      underContract,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Row construction
// ─────────────────────────────────────────────────────────────────────────

function buildRow(card: ParsedCard): UpsertScrapedInput {
  const communityName = card.neighborhood
    ? `${DEVELOPER_NAME} · ${card.neighborhood}`
    : DEVELOPER_NAME;

  const titleBase = card.planName ?? card.address.street ?? 'Inventory home';
  const titleWithCommunity = card.neighborhood
    ? `${titleBase} at ${card.neighborhood}`
    : titleBase;
  const title = `${titleWithCommunity} — ${card.builderName}`;

  // Rich synthesized description (per template §6 — Hollows detail pages
  // are Cloudflare-gated so we can't scrape marketing copy).
  const parts: string[] = [];
  if (card.planName) {
    parts.push(`${card.planName} by ${card.builderName}.`);
  } else {
    parts.push(`Built by ${card.builderName}.`);
  }
  if (card.neighborhood) {
    parts.push(`Located in the ${card.neighborhood} neighborhood at ${DEVELOPER_NAME}.`);
  }
  const specs: string[] = [];
  if (card.beds != null) specs.push(`${card.beds} bedrooms`);
  const bathsTotal =
    card.baths != null && card.halfBaths != null
      ? `${card.baths} full / ${card.halfBaths} half baths`
      : card.baths != null
        ? `${card.baths} bathrooms`
        : null;
  if (bathsTotal) specs.push(bathsTotal);
  if (card.sqft != null) specs.push(`${card.sqft.toLocaleString()} sq ft`);
  if (card.garages != null) specs.push(`${card.garages}-car garage`);
  if (card.stories != null) specs.push(`${card.stories} ${card.stories === 1 ? 'story' : 'stories'}`);
  if (specs.length > 0) parts.push(specs.join(', ') + '.');
  if (card.price != null) {
    parts.push(`Priced at $${card.price.toLocaleString()}.`);
  }
  parts.push(`Located at ${card.address.full}.`);
  if (card.underContract) parts.push('Currently under contract.');
  const description = parts.join(' ');

  const extraDetails: Record<string, string> = {};
  if (card.neighborhood) extraDetails['Neighborhood'] = card.neighborhood;
  if (card.halfBaths != null) extraDetails['Half Baths'] = String(card.halfBaths);
  if (card.garages != null) extraDetails['Garages'] = String(card.garages);
  if (card.stories != null) extraDetails['Stories'] = String(card.stories);
  if (card.planName) extraDetails['Plan'] = card.planName;
  if (card.underContract) extraDetails['Status'] = 'Under Contract';

  return {
    externalId: card.externalId,
    kind: 'listing',
    publication: 'realtyline',
    submittedByName: 'Hollows Auto-Importer',
    submittedByEmail: 'scraper-hollows@harmonyone.system',
    builderName: card.builderName,
    title,
    city: card.address.city,
    state: card.address.state,
    description,
    bedsMin: card.beds,
    bedsMax: card.beds,
    bathsMin: card.baths,
    bathsMax: card.baths,
    sqftMin: card.sqft,
    sqftMax: card.sqft,
    priceMin: card.price,
    priceMax: card.price,
    flyerPdfUrl: null,
    sourceUrl: card.detailUrl,
    thumbnailUrl: card.thumbnailUrl,
    galleryUrls: card.thumbnailUrl ? [card.thumbnailUrl] : null,
    address: card.address.full,
    readyDate: null,
    planName: card.planName,
    communityName,
    homeType: 'showcase',
    extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────

export type HollowsScrapeResult = {
  rawCount: number;
  rows: UpsertScrapedInput[];
  skipped: { externalId: string | null; reason: string }[];
};

export async function fetchHollows(): Promise<HollowsScrapeResult> {
  const res = await fetch(LIST_URL, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Hollows list fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  const qmi = extractQmiSection(html);
  if (!qmi) {
    return { rawCount: 0, rows: [], skipped: [] };
  }

  // Split on the card opener; the first slice before any card is preamble.
  const cardBlocks = qmi.split('<div class="hollows-home-card"').slice(1);

  const rows: UpsertScrapedInput[] = [];
  const skipped: { externalId: string | null; reason: string }[] = [];
  const seenIds = new Set<string>();

  for (const block of cardBlocks) {
    const { card, reason } = parseCard(block);
    if (!card) {
      skipped.push({ externalId: null, reason: reason ?? 'parse failed' });
      continue;
    }
    if (seenIds.has(card.externalId)) {
      skipped.push({ externalId: card.externalId, reason: 'duplicate' });
      continue;
    }
    seenIds.add(card.externalId);
    rows.push(buildRow(card));
  }

  return { rawCount: cardBlocks.length, rows, skipped };
}
