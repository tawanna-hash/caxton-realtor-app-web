// lib/scrapers/la-cima-promotions.ts
//
// La Cima (developer) — builder promotions/incentives scraper.
//
// Source: Pipsy inventory feed https://public1.pipsy.io/processProperty/30-1
// (the widget embedded on https://lacimatx.com/find-your-dream-home/).
//
// La Cima's June 2026 site redesign removed /builder-promotions/ (404). The
// builder promotions now ship inside the Pipsy feed: every home in
// `available[]` and `models[]` carries an `incentive[]` array of
//   { incentive: <headline>, pdf: <flyer PDF>, thumbnail: <flyer JPG>, url }
// We de-duplicate by flyer across all homes and emit one row per builder
// incentive.
//
// We attribute every row to builder_name='La Cima' (the master-planned
// developer). The actual builder is preserved in title + description so
// it shows up on the Promotions tab of the La Cima developer page.
//
// Attempt to extract an expiration date from the file name when present.
// File names follow patterns like:
//   Incentive-879-Perry-Promo-EX-12-31-2026.pdf
//   Incentive-727-Pulte-Promo-La-Cima-FHA-4.75percent-21-Buydown-EX-9-30-2026.pdf
//
// We pull the LAST date in the file name as the expiration date.
//
// Output rows have kind='promotion'. Per the SRR auto-activate policy
// established in S14, the cron route flips newly-created La Cima promo
// rows to status='active' so they're immediately public. Existing rows
// keep their human-set status.

import type { UpsertScrapedInput } from '../builder-inventory';
import { isPromotionExpired } from './promotion-utils';

const PIPSY_API_URL = 'https://public1.pipsy.io/processProperty/30-1';
const PROMOTIONS_URL = 'https://lacimatx.com/find-your-dream-home/';
const LA_CIMA_CITY = 'San Marcos';
const LA_CIMA_STATE = 'TX';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://lacimatx.com',
  Referer: PROMOTIONS_URL,
} as const;

type PipsyIncentive = { incentive?: string | null; pdf?: string | null; thumbnail?: string | null; url?: string | null };
type PipsyHome = { builder?: string | null; builder_marketing_name?: string | null; incentive?: PipsyIncentive[] | null };
type PipsyFeed = { available?: PipsyHome[]; models?: PipsyHome[] };

export type LaCimaPromoScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { reason: string; builder?: string }[];
};

async function fetchFeed(): Promise<PipsyFeed> {
  const res = await fetch(PIPSY_API_URL, {
    method: 'GET',
    headers: COMMON_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${PIPSY_API_URL}`);
  const json = (await res.json()) as PipsyFeed;
  if (!json || (!Array.isArray(json.available) && !Array.isArray(json.models))) {
    throw new Error(`Unexpected Pipsy response shape from ${PIPSY_API_URL}`);
  }
  return json;
}

function cleanUrl(u?: string | null): string | null {
  const t = (u ?? '').trim();
  return /^https?:\/\//i.test(t) ? t : null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Pull the last MM-DD-YYYY (or M-D-YYYY) date out of a file name. We
// take the LAST one because filenames sometimes encode a date range
// ("Range-3-20-2026-through-3-60-2026") where the second is the end.
// Returns null if no plausible date is found, or if the parsed date
// fails validation (e.g. month 13, day 60).
function expirationDateFromFilename(url: string | null): string | null {
  if (!url) return null;
  const name = url.split('/').pop() ?? '';
  // Strip the extension to avoid matching ".jpg" or other digit-y suffixes.
  const stem = name.replace(/\.[a-z0-9]+$/i, '');
  const matches = [...stem.matchAll(/(\d{1,2})-(\d{1,2})-(\d{4})/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const mo = parseInt(m[1], 10);
    const da = parseInt(m[2], 10);
    const yr = parseInt(m[3], 10);
    if (mo < 1 || mo > 12) continue;
    if (da < 1 || da > 31) continue;
    if (yr < 2020 || yr > 2099) continue;
    const mm = String(mo).padStart(2, '0');
    const dd = String(da).padStart(2, '0');
    return `${yr}-${mm}-${dd}`;
  }
  return null;
}

// Best-effort promo type — La Cima cards rarely embed type text, so default
// to 'incentive'. The SRR scraper does the same.
function classifyPromoType(): 'incentive' {
  return 'incentive';
}

export async function fetchLaCimaPromotions(): Promise<LaCimaPromoScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { reason: string; builder?: string }[] = [];

  let feed: PipsyFeed;
  try {
    feed = await fetchFeed();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`La Cima promotions fetch failed: ${msg}`);
  }

  type Candidate = {
    builderName: string;
    headline: string | null;
    imgUrl: string | null;
    flyerUrl: string | null;
  };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const home of [...(feed.available ?? []), ...(feed.models ?? [])]) {
    const builderName = (home.builder_marketing_name || home.builder || '').trim();
    for (const inc of home.incentive ?? []) {
      const pdf = cleanUrl(inc.pdf);
      const img = cleanUrl(inc.thumbnail);
      const link = cleanUrl(inc.url);
      const flyerUrl = pdf ?? link ?? img;
      const headline = (inc.incentive ?? '').replace(/\s+/g, ' ').trim() || null;
      const key = `${builderName}|${flyerUrl ?? headline ?? ''}`;
      if (!builderName || (!flyerUrl && !headline) || seen.has(key)) continue;
      seen.add(key);
      candidates.push({ builderName, headline, imgUrl: img, flyerUrl });
    }
  }

  const rawCount = candidates.length;

  // Multiple cards under the same builder (e.g. Highland Homes has 3) need
  // distinct externalIds. We append a counter scoped to the builder.
  const builderCounters = new Map<string, number>();

  for (const c of candidates) {
    const builderSlug = slugify(c.builderName);
    const n = (builderCounters.get(builderSlug) ?? 0) + 1;
    builderCounters.set(builderSlug, n);

    // Stable externalId: we hash the flyer URL into the slug so the same
    // card returns to the same row across runs even if the page reorders.
    // The flyer URL changes when the builder ships a new flyer (which is
    // exactly what we want — a new row, the old one stops being upserted
    // and falls out of "active" via admin policy or a future inactive cron).
    const flyerSlug = c.flyerUrl ? slugify(c.flyerUrl.split('/').pop() ?? '') : `index-${n}`;
    const externalId = `lacima-promotion/${builderSlug}/${flyerSlug || `index-${n}`}`;

    const expiresAt = expirationDateFromFilename(c.flyerUrl) ?? expirationDateFromFilename(c.imgUrl);

    rows.push({
      externalId,
      kind: 'promotion',
      publication: 'realtyline',
      submittedByName: 'La Cima Promotions Auto-Importer',
      submittedByEmail: 'scraper-la-cima-promotions@harmonyone.system',
      builderName: c.builderName,
      title: c.headline ? `${c.builderName}: ${c.headline}`.slice(0, 200) : `${c.builderName} incentive at La Cima`,
      city: LA_CIMA_CITY,
      state: LA_CIMA_STATE,
      description: c.headline
        ? `${c.headline} Builder incentive from ${c.builderName} at La Cima.`
        : `Builder incentive from ${c.builderName} at La Cima.`,
      bedsMin: null,
      bedsMax: null,
      bathsMin: null,
      bathsMax: null,
      sqftMin: null,
      sqftMax: null,
      priceMin: null,
      priceMax: null,
      flyerPdfUrl: c.flyerUrl,
      thumbnailUrl: c.imgUrl,
      promoType: classifyPromoType(),
      startsAt: null,
      expiresAt,
      sourceUrl: PROMOTIONS_URL,
      communityName: 'La Cima',
    });
  }

  // Filter out expired promotions — don't upsert, let prune handle deletion.
  const activeRows = rows.filter(
    (r) => !isPromotionExpired(r.expiresAt as string | null),
  );
  const expiredCount = rows.length - activeRows.length;
  if (expiredCount > 0) {
    skipped.push({ reason: `${expiredCount} promotion(s) expired and skipped` });
  }

  return { rows: activeRows, rawCount, skipped };
}
