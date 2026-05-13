// lib/scrapers/giddens.ts
//
// Giddens Homes Austin — per-home scraper (S13).
//
// Source: https://giddenshomes.com/homes/ — a WordPress site using the
// Smarttouch Interactive plugin. Homes are server-rendered inside
// `<div class="wp-block-smarttouch-homes">` blocks. No JSON API, but the
// HTML is consistent and parseable via regex on `data-*` attributes.
//
// Home card structure (each one):
//   <div id="spec_101_nighthorse" class="spec" rel="13409"
//        data-community="4002"
//        data-floorplan=""
//        data-price="899000"
//        data-bedrooms="4"
//        data-bathrooms="4"
//        data-garage="3"
//        data-story="1"
//        data-sqft="3391">
//     <div class="title"><span>101 Nighthorse</span></div>
//     <div class="photo"><img src="/wp-content/.../03-Front-Entry-Walkway-480x320.jpg" /></div>
//     <div class="address">
//       <span class="streetnumber">101</span>
//       <span class="route">Nighthorse</span>
//       <span class="city">Liberty Hill</span>
//       <span class="state">TX</span>
//     </div>
//     <div class="community">Clearwater Ranch</div>
//     ...
//
// Communities (from the filter selector at top of page):
//   4002:  Clearwater Ranch
//   4020:  The Hollows
//   10510: Burnet Hilltop Estates
//   11374: Riverstone
//   12631: Leander Estates
//   13324: Scofield Farms Estates
//
// Notes:
//   - bathrooms is already a decimal (e.g., "4.5") — no fullBaths/halfBaths split
//   - "Liberty Hill", "Leander", "Burnet" etc all roll up to greater Austin
//   - No readyDate field exists. data-available is empty for all observed homes.

const HOMES_URL = 'https://giddenshomes.com/homes/';
const GIDDENS_BASE_URL = 'https://giddenshomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per home.
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedGiddensRow = {
  externalId: string;
  builderName: 'Giddens Homes';
  title: string;
  city: string;
  state: string;
  description: string | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  thumbnailUrl: string | null;
  flyerPdfUrl: string | null;
  address: string | null;
  readyDate: string | null;
  planName: string | null;
  communityName: string | null;
  homeType: 'showcase';
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function parseNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,$\s]/g, '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseInteger(s: string | null | undefined): number | null {
  const n = parseNumber(s);
  if (n == null) return null;
  return Math.round(n);
}

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return GIDDENS_BASE_URL + path;
  return null;
}

// Pull `attr="VALUE"` out of a string. Returns null if not present.
function getAttr(html: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}="([^"]*)"`);
  const m = html.match(re);
  return m ? m[1] : null;
}

// Pull inner text from `<TAG class="CLASS">TEXT</TAG>`. Strips tags inside.
function getInnerText(html: string, klass: string): string | null {
  const re = new RegExp(
    `<[a-z]+[^>]*class="[^"]*\\b${klass}\\b[^"]*"[^>]*>([\\s\\S]*?)</[a-z]+>`,
    'i',
  );
  const m = html.match(re);
  if (!m) return null;
  // Strip nested tags
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

// ─────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────

// Find all home <div class="spec" ...> blocks. Each is reasonably bounded
// since they're siblings in a flat list.
function extractHomeCards(html: string): string[] {
  // Match from the opening tag of a spec div to just before the next one
  // (or end of homes container). Greedy-safe via lazy match to `<div id="spec_`.
  const cards: string[] = [];
  const startRe = /<div[^>]*\bid="spec_[^"]*"[^>]*\bclass="spec"[^>]*>/g;
  const matches: { start: number; tagLen: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(html)) !== null) {
    matches.push({ start: m.index, tagLen: m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : html.length;
    cards.push(html.slice(start, end));
  }
  return cards;
}

// Parse one card's HTML into a normalized row.
function parseCard(card: string): ScrapedGiddensRow | null {
  // External id — use rel attribute (e.g. "13409") which is stable.
  const rel = getAttr(card, 'rel');
  if (!rel) return null;
  const externalId = `giddens/${rel}`;

  // Numeric data fields from data-* attributes
  const beds = parseInteger(getAttr(card, 'data-bedrooms'));
  const baths = parseNumber(getAttr(card, 'data-bathrooms'));
  const sqft = parseInteger(getAttr(card, 'data-sqft'));
  const price = parseInteger(getAttr(card, 'data-price'));
  const communityName = getInnerText(card, 'community');

  // Title is in <div class="title"><span>TEXT</span></div>
  const titleText = getInnerText(card, 'title');
  const title = titleText && communityName
    ? `${titleText} at ${communityName}`
    : titleText
    ? titleText
    : communityName
    ? `Inventory home at ${communityName}`
    : 'Giddens inventory home';

  // Address: assemble from spans inside <div class="address">
  const streetNumber = getInnerText(card, 'streetnumber') || '';
  const route = getInnerText(card, 'route') || '';
  const city = getInnerText(card, 'city') || 'Austin';
  const stateText = getInnerText(card, 'state') || 'TX';
  const streetLine = [streetNumber, route].filter(Boolean).join(' ').trim();
  const address = streetLine
    ? `${streetLine}, ${city}, ${stateText}`
    : null;

  // Thumbnail from <img src="...">
  const imgMatch = card.match(/<img[^>]*\bsrc="([^"]+)"/i);
  const thumbnailUrl = imgMatch ? normalizeUrl(imgMatch[1]) : null;

  // Flyer link: card uses an onclick handler, not a real href. Best link
  // we can give realtors is the metro homes page; clicking it will let
  // them find the home there.
  const flyerPdfUrl = HOMES_URL;

  return {
    externalId,
    builderName: 'Giddens Homes',
    title,
    city,
    state: stateText.toUpperCase(),
    description: null,
    bedsMin: beds,
    bedsMax: beds,
    bathsMin: baths,
    bathsMax: baths,
    sqftMin: sqft,
    sqftMax: sqft,
    priceMin: price,
    priceMax: price,
    thumbnailUrl,
    flyerPdfUrl,
    address,
    readyDate: null, // data-available is always empty on Giddens
    planName: null,  // no floor plan field in their data structure
    communityName,
    homeType: 'showcase',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchGiddensAustin(): Promise<{
  rows: ScrapedGiddensRow[];
  rawCount: number;
  skipped: number;
}> {
  let res: Response;
  try {
    res = await fetch(HOMES_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Giddens Homes fetch failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Giddens Homes returned HTTP ${res.status}`);
  }

  const html = await res.text();
  if (!html || html.length < 1000) {
    throw new Error('Giddens Homes returned suspiciously small body');
  }

  const cards = extractHomeCards(html);
  const rawCount = cards.length;

  if (rawCount === 0) {
    throw new Error(
      'Giddens Homes: no home cards found (DOM structure may have changed)',
    );
  }

  const rows: ScrapedGiddensRow[] = [];
  let skipped = 0;
  for (const card of cards) {
    const normalized = parseCard(card);
    if (normalized) {
      rows.push(normalized);
    } else {
      skipped++;
    }
  }

  return { rows, rawCount, skipped };
}
