// scripts/scrape-hollows.mjs
//
// Runs on GitHub Actions (not Vercel) because hollowslaketravis.com's
// Cloudflare rules block Vercel's outbound IPs, but let GitHub Actions
// runner IPs through with a browser-shaped User-Agent.
//
// Flow:
//   1. GET https://hollowslaketravis.com/available-homes/
//   2. Parse the Quick Move-In section — same regex/data-attr logic
//      as lib/scrapers/hollows.ts (kept in sync manually; if you change
//      the source parser, mirror the change here).
//   3. POST parsed rows to $INGEST_URL/api/ingest/scrape-hollows with
//      Authorization: Bearer $INGEST_SECRET. The Next.js API route runs
//      the upsert + prune against Neon.
//
// Env:
//   INGEST_URL     — e.g. https://realtynewsnow.app  (defaults to prod)
//   INGEST_SECRET  — matches Vercel env of same name
//
// Exit codes:
//   0 — success (rows may be zero if source has no QMI, that's a valid
//       "empty feed", ingest still runs a prune-safe pass)
//   1 — fetch or parse failure (before ingest)
//   2 — ingest failure (server rejected the payload)

const INGEST_URL = process.env.INGEST_URL || 'https://realtynewsnow.app';
const INGEST_SECRET = process.env.INGEST_SECRET;
if (!INGEST_SECRET) {
  console.error('INGEST_SECRET is required');
  process.exit(1);
}

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
};

// ─── HTML utilities ───────────────────────────────────────────────────
function decodeEntities(x) {
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
function collapse(x) {
  if (!x) return null;
  const s = decodeEntities(x).replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}
function getDataAttr(html, name) {
  const m = new RegExp(`data-${name}="([^"]*)"`).exec(html);
  return m ? m[1] : null;
}
function between(html, start, end) {
  const re = new RegExp(
    start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '([\\s\\S]*?)' +
      end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const m = re.exec(html);
  return m ? m[1] : null;
}
function parseIntOrNull(x) {
  if (!x) return null;
  const n = parseInt(String(x).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
function humanizeSlug(slug) {
  return slug
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

// ─── Address ──────────────────────────────────────────────────────────
function parseAddress(raw) {
  if (!raw) return null;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const street = parts[0] || null;
  const city = parts[1] || CITY_DEFAULT;
  let state = STATE_DEFAULT;
  let zip = null;
  if (parts[2]) {
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

function externalIdFromDetailUrl(url) {
  if (!url) return null;
  const m = /\/markethomes\/([^/?#]+)/i.exec(url);
  return m ? `hollows/${m[1]}` : null;
}

function extractQmiSection(fullHtml) {
  const startMarker = 'Quick Move-In Homes</h2>';
  const endMarker = 'Coming Soon</h2>';
  const start = fullHtml.indexOf(startMarker);
  if (start === -1) return null;
  const end = fullHtml.indexOf(endMarker, start);
  return end === -1 ? fullHtml.slice(start) : fullHtml.slice(start, end);
}

// ─── Card parsing ─────────────────────────────────────────────────────
function parseCard(html) {
  const hrefMatch = /href="(https:\/\/hollowslaketravis\.com\/markethomes\/[^"]+)"/.exec(html);
  const detailUrl = hrefMatch ? hrefMatch[1] : null;
  const externalId = externalIdFromDetailUrl(detailUrl);
  if (!detailUrl || !externalId) return { card: null, reason: 'no detail URL / externalId' };

  const builderDisplay = collapse(between(html, '<span class="hollows-collection-tag">', '</span>'));
  const builderSlug = getDataAttr(html, 'builder');
  const builderName = builderDisplay || (builderSlug ? humanizeSlug(builderSlug) : null);
  if (!builderName) return { card: null, reason: 'no builder name' };

  const rawAddress = collapse(between(html, '<h3 class="hollows-home-title">', '</h3>'));
  const address = parseAddress(rawAddress);
  if (!address) return { card: null, reason: 'no address' };

  const planName = collapse(between(html, '<span class="hollows-badge-subtitle">', '</span>')) ?? null;

  const beds = parseIntOrNull(getDataAttr(html, 'bedrooms'));
  const baths = parseIntOrNull(getDataAttr(html, 'bathrooms'));
  const sqft = parseIntOrNull(getDataAttr(html, 'sqft'));
  const price = parseIntOrNull(getDataAttr(html, 'price'));

  const statNumber = (label) => {
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
    /<img[^>]*src="(https:\/\/hollowslaketravis\.com\/wp-content\/uploads\/[^"]+)"/.exec(html);
  const thumbnailUrl = imgMatch ? imgMatch[1] : null;

  const neighborhoodSlug = getDataAttr(html, 'neighborhood');
  const neighborhood = neighborhoodSlug ? humanizeSlug(neighborhoodSlug) : null;
  const underContract = getDataAttr(html, 'under-contract') === '1';

  return {
    card: {
      externalId, detailUrl, builderName, planName, address,
      beds, baths, halfBaths, sqft, price, garages, stories,
      thumbnailUrl, neighborhood, underContract,
    },
  };
}

// ─── Row shape (matches UpsertScrapedInput) ───────────────────────────
function buildRow(card) {
  const communityName = card.neighborhood
    ? `${DEVELOPER_NAME} · ${card.neighborhood}`
    : DEVELOPER_NAME;

  const titleBase = card.planName ?? card.address.street ?? 'Inventory home';
  const titleWithCommunity = card.neighborhood
    ? `${titleBase} at ${card.neighborhood}`
    : titleBase;
  const title = `${titleWithCommunity} — ${card.builderName}`;

  const parts = [];
  if (card.planName) parts.push(`${card.planName} by ${card.builderName}.`);
  else parts.push(`Built by ${card.builderName}.`);
  if (card.neighborhood) {
    parts.push(`Located in the ${card.neighborhood} neighborhood at ${DEVELOPER_NAME}.`);
  }
  const specs = [];
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
  if (card.price != null) parts.push(`Priced at $${card.price.toLocaleString()}.`);
  parts.push(`Located at ${card.address.full}.`);
  if (card.underContract) parts.push('Currently under contract.');
  const description = parts.join(' ');

  const extraDetails = {};
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

async function fetchHollows() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res;
  try {
    res = await fetch(LIST_URL, { headers: HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Hollows list fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const qmi = extractQmiSection(html);
  if (!qmi) return { rawCount: 0, rows: [], skipped: [] };

  const cardBlocks = qmi.split('<div class="hollows-home-card"').slice(1);
  const rows = [];
  const skipped = [];
  const seenIds = new Set();

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

async function main() {
  const startedAt = Date.now();
  const scrape = await fetchHollows();
  console.log(
    `[scrape-hollows] fetched: rawCount=${scrape.rawCount} rows=${scrape.rows.length} skipped=${scrape.skipped.length}`,
  );
  if (scrape.skipped.length) {
    for (const s of scrape.skipped) console.log(`  skipped ${s.externalId ?? '(no-id)'}: ${s.reason}`);
  }

  const ingestUrl = `${INGEST_URL.replace(/\/+$/, '')}/api/ingest/scrape-hollows`;
  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${INGEST_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rawCount: scrape.rawCount,
      rows: scrape.rows,
      skipped: scrape.skipped,
    }),
  });
  const text = await res.text();
  console.log(`[scrape-hollows] ingest response: ${res.status}`);
  console.log(text);
  if (!res.ok) {
    console.error(`[scrape-hollows] ingest failed after ${Date.now() - startedAt}ms`);
    process.exit(2);
  }
  console.log(`[scrape-hollows] done in ${Date.now() - startedAt}ms`);
}

main().catch((err) => {
  console.error('[scrape-hollows] fatal:', err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
