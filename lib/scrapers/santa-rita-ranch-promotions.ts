// lib/scrapers/santa-rita-ranch-promotions.ts
//
// Santa Rita Ranch (developer) — builder incentives scraper.
//
// Source: https://santaritaranchaustin.com/builder-incentives-in-liberty-hill/
//
// The page is a static Elementor grid of 16 builder cards. Each card has:
//   - Builder name (in <h2 class="elementor-heading-title">)
//   - Builder hero image (via NitroPack: nitro-lazy-src on <img>)
//   - "View Incentive" button → hubs.ly short URL (redirects to a HubSpot
//     Documents viewer with the flyer PDF / landing page)
//   - "Contact Builder" button → /builders/<slug>/ on the same site
//
// There is no description, percentage, dollar amount, or date text on
// the page — those live inside the HubSpot document. So we emit one
// row per builder with:
//   - title: "<Builder Name> incentive at Santa Rita Ranch"
//   - description: null (human reviewer fills in or leaves blank)
//   - flyerPdfUrl: resolved canonical URL behind the hubs.ly redirect
//   - sourceUrl: the SRR incentives page
//   - thumbnailUrl: builder hero image (de-NitroPack-ified to canonical CDN URL)
//
// Output rows have kind='promotion'. Per builder-inventory.ts S14 behavior,
// scraped promotion rows land as status='pending' so a human reviews
// the legal text and dates before publishing.

import * as cheerio from 'cheerio';
import type { Element as DomElement } from 'domhandler';
import type { UpsertScrapedInput } from '../builder-inventory';

const INCENTIVES_URL =
  'https://santaritaranchaustin.com/builder-incentives-in-liberty-hill/';
const SRR_CITY = 'Liberty Hill';
const SRR_STATE = 'TX';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

export type SRRPromoScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { reason: string; builder?: string }[];
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    method: 'GET',
    headers: COMMON_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const html = await res.text();
  if (!html || html.length < 1000) {
    throw new Error(`Body suspiciously small from ${url}`);
  }
  return html;
}

// Follow a hubs.ly redirect to its canonical destination. Hubs.ly is a
// 301 short-URL service used by HubSpot; we want the resolved URL so the
// "flyer" link in the app goes straight to the document.
async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    return res.url || url;
  } catch {
    // If HEAD fails for any reason, fall back to the original short URL.
    return url;
  }
}

// NitroPack rewrites images: src becomes a base64 placeholder and the
// canonical URL goes into nitro-lazy-src. Also strips off Nitro's CDN
// rewrite prefix to get the original wp-content URL.
function pickImageUrl($img: cheerio.Cheerio<DomElement>): string | null {
  const cands = [
    $img.attr('nitro-lazy-src'),
    $img.attr('data-src'),
    $img.attr('src'),
  ];
  for (const c of cands) {
    if (!c) continue;
    if (c.startsWith('data:')) continue;
    // Strip Nitro CDN prefix:
    // https://cdn-XXX.nitrocdn.com/HASH/assets/images/optimized/rev-HASH/santaritaranchaustin.com/wp-content/...
    // → https://santaritaranchaustin.com/wp-content/...
    const m = c.match(/santaritaranchaustin\.com\/wp-content\/.+$/);
    if (m) return 'https://' + m[0];
    return c;
  }
  return null;
}

// Slugify a builder name into a stable identifier for externalId.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Best-effort promo type classification from the builder name.
// Without description text, default to 'incentive'.
function classifyPromoType(): 'incentive' {
  return 'incentive';
}

export async function fetchSantaRitaRanchPromotions(): Promise<SRRPromoScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { reason: string; builder?: string }[] = [];

  let html: string;
  try {
    html = await fetchHtml(INCENTIVES_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SRR incentives fetch failed: ${msg}`);
  }

  const $ = cheerio.load(html);

  // Each builder card is an .e-child node that contains both a heading
  // widget (builder name) and at least one button widget with a hubs.ly
  // href. We don't anchor on data-id="82a333d" (the inspection's section
  // id) since those can change with site edits — instead we walk every
  // .e-child and accept the ones that have the right shape.
  const seenBuilders = new Set<string>();
  const candidates: Array<{
    builderName: string;
    imgUrl: string | null;
    hubsLyUrl: string;
    contactUrl: string | null;
  }> = [];

  $('.e-child').each((_, el) => {
    const $card = $(el);

    // Skip mobile-only duplicates
    if ($card.hasClass('elementor-hidden-desktop')) return;

    const nameRaw = $card.find('.elementor-heading-title').first();
    if (!nameRaw.length) return;

    // <h2>Pulte Homes<br/>Homestead</h2> → "Pulte Homes Homestead"
    const builderName = nameRaw
      .html()
      ?.replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!builderName) return;

    // Identify the "View Incentive" button (anything pointing at hubs.ly)
    let hubsLyUrl: string | null = null;
    let contactUrl: string | null = null;
    $card.find('a.elementor-button').each((__, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      if (/hubs\.ly/i.test(href)) {
        if (!hubsLyUrl) hubsLyUrl = href.trim();
      } else if (/\/builders\//.test(href)) {
        if (!contactUrl) contactUrl = href.trim();
      }
    });

    if (!hubsLyUrl) return; // Not an incentive card

    const imgUrl = pickImageUrl($card.find('img').first());

    candidates.push({ builderName, imgUrl, hubsLyUrl, contactUrl });
  });

  const rawCount = candidates.length;

  // Resolve hubs.ly redirects in parallel (cap concurrency at 4).
  const BATCH = 4;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    const resolved = await Promise.all(
      chunk.map((c) => resolveRedirect(c.hubsLyUrl).catch(() => c.hubsLyUrl)),
    );

    chunk.forEach((c, idx) => {
      const builderSlug = slugify(c.builderName);

      // Skip duplicate-builder cards on the same page (rare but possible
      // when the page has copy-paste rows pointing at the same builder).
      if (seenBuilders.has(builderSlug)) {
        skipped.push({
          reason: 'duplicate builder card on the page',
          builder: c.builderName,
        });
        return;
      }
      seenBuilders.add(builderSlug);

      rows.push({
        externalId: `srr-promotion/${builderSlug}`,
        kind: 'promotion',
        publication: 'realtyline',
        submittedByName: 'Santa Rita Ranch Promotions Auto-Importer',
        submittedByEmail:
          'scraper-santa-rita-ranch-promotions@harmonyone.system',
        builderName: c.builderName,
        title: `${c.builderName} incentive at Santa Rita Ranch`,
        city: SRR_CITY,
        state: SRR_STATE,
        description: null,
        bedsMin: null,
        bedsMax: null,
        bathsMin: null,
        bathsMax: null,
        sqftMin: null,
        sqftMax: null,
        priceMin: null,
        priceMax: null,
        flyerPdfUrl: resolved[idx],
        thumbnailUrl: c.imgUrl,
        promoType: classifyPromoType(),
        startsAt: null,
        expiresAt: null,
        sourceUrl: INCENTIVES_URL,
        communityName: 'Santa Rita Ranch',
      });
    });
  }

  return { rows, rawCount, skipped };
}
