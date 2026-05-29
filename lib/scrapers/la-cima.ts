// lib/scrapers/la-cima.ts
//
// La Cima (developer) — move-in-ready (QMI) homes scraper.
//
// Source: https://public1.pipsy.io/processProperty/30-1
//
// La Cima ships its inventory through Pipsy's hosted widget on
// /shop-homes/. The widget loads its full state from a single GET
// request to public1.pipsy.io/processProperty/<property-id>, where
// 30-1 is La Cima's Pipsy property ID (visible as data-id on the
// pipsy script tag). The response is a ~2.7 MB JSON document with
// keys including:
//
//   available[]       — the move-in-ready homes (33 as of writing).
//                       Each entry has id, address, builder, beds,
//                       full_baths, half_baths, sqft, price, was_price,
//                       lot_status, move_in_date (epoch sec),
//                       marketing_description, images[] (cdn.pipsy.io
//                       transform URLs), latitude, longitude, etc.
//   models[]          — builder model homes (skipped — not for sale).
//   floorplans[]      — plan catalogs (used for plan name when missing).
//   property          — community metadata (lat/lng, logos, name).
//
// We emit one row per `available` home. Status filter: Pipsy's
// "Available Home" entries are immediately move-in-ready; "Coming Soon"
// entries are pre-construction but still on the public shopping page,
// so we include them too (matches what the developer shows). The
// row's description distinguishes the two.
//
// La Cima is attributed as a master-planned developer:
//   - builder_name='La Cima'
//   - actual builder appears in title suffix ("— Perry Homes") and
//     in the description ("Built by Perry Homes.")
//   - InventoryCard's pillLabelForListing() already extracts the
//     trailing builder from "— X" titles for La Cima rows.
//
// All listing rows include:
//   - flyerPdfUrl: shop-homes deep link (#home-<id>)
//   - thumbnailUrl: first image (CDN-resized from Pipsy)
//   - galleryUrls:  full image array (up to MAX_GALLERY)
//   - readyDate:    move_in_date when present
//   - planName:     floorplan.name when present
//   - communityName: 'La Cima · <neighborhood>' when neighborhood is
//                    a real name; falls back to 'La Cima' otherwise.

import type { UpsertScrapedInput } from '../builder-inventory';

const PIPSY_PROPERTY_ID = '30-1';
const PIPSY_API_URL = `https://public1.pipsy.io/processProperty/${PIPSY_PROPERTY_ID}`;
const SHOP_HOMES_URL = 'https://lacimatx.com/shop-homes/';

const LA_CIMA_CITY = 'San Marcos';
const LA_CIMA_STATE = 'TX';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const REQ_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://lacimatx.com',
  Referer: 'https://lacimatx.com/shop-homes/',
} as const;

// Cap stored image arrays — homes ship with up to 50+ photos and we
// don't need every shot in the database row.
const MAX_GALLERY = 24;

// Hero image for the synthetic community summary row. Pool / amenity
// center photo from the lacimatx.com homepage slider.
const COMMUNITY_HERO_IMAGE =
  'https://lacimatx.com/wp-content/uploads/LaCima_9424.jpg';

export type LaCimaScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { reason: string; address?: string; id?: number }[];
};

// ─────────────────────────────────────────────────────────────────────────
// Pipsy response shape — minimal types for fields we use.
// ─────────────────────────────────────────────────────────────────────────

type PipsyHome = {
  id: number;
  address?: string | null;
  builder?: string | null;
  builder_marketing_name?: string | null;
  lot?: string | null;
  price?: number | null;
  was_price?: number | null;
  full_baths?: number | null;
  half_baths?: number | null;
  beds?: number | null;
  garage?: number | null;
  marketing_lot_type?: string | null;
  lot_status?: string | null;
  sqft?: number | null;
  stories?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation?: string | null;
  images?: string[] | null;
  builder_id?: number | null;
  move_in_date?: number | null;     // epoch seconds
  complete_date?: number | null;    // epoch seconds
  marketing_description?: string | null;
  neighborhood?: string | null;
  start_date?: number | null;
  manual_construction_status?: string | null;
  floorplan?: {
    id?: number | null;
    name?: string | null;
    feed_name?: string | null;
  } | null;
};

type PipsyResponse = {
  available?: PipsyHome[];
  property?: {
    name?: string | null;
    marketing_name?: string | null;
  };
};

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

async function fetchPipsyData(): Promise<PipsyResponse> {
  const res = await fetch(PIPSY_API_URL, {
    method: 'GET',
    headers: REQ_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Pipsy GET ${PIPSY_API_URL} → HTTP ${res.status}`);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Pipsy returned non-JSON body. First 200 chars: ${text.slice(0, 200)}`,
    );
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Pipsy response was not an object');
  }
  return data as PipsyResponse;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

// Strip HTML tags and collapse whitespace. Pipsy's marketing_description
// often contains <p>, <br>, and Outlook copy-paste cruft.
function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

// Combine full + half baths into the decimal value the builder_inventory
// schema stores (numeric(3,1)). e.g. 3 full + 1 half → 3.5.
function combineBaths(full: number | null | undefined, half: number | null | undefined): number | null {
  const f = typeof full === 'number' && full >= 0 ? full : null;
  const h = typeof half === 'number' && half >= 0 ? half : null;
  if (f == null && h == null) return null;
  return (f ?? 0) + (h ?? 0) * 0.5;
}

// Pipsy's epoch-seconds dates → ISO YYYY-MM-DD.
function epochToIso(ts: number | null | undefined): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return null;
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Pipsy's "neighborhood" field on La Cima is "PID - NIA # 3" for every
// home — clearly an internal phasing label rather than a real neighborhood
// name. Only surface it if it looks like a marketable name.
function cleanNeighborhood(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  // Hide internal labels like "PID - NIA # 3", "NIA #2", etc.
  if (/^pid\b|^nia\b|#\s*\d+|^section\s*\d+$/i.test(t)) return null;
  return t;
}

// ─────────────────────────────────────────────────────────────────────────
// Row builder
// ─────────────────────────────────────────────────────────────────────────

function buildRow(home: PipsyHome): UpsertScrapedInput | null {
  if (!home.id) return null;
  const builderName = (home.builder || home.builder_marketing_name || '').trim();
  if (!builderName) return null;
  const address = (home.address || '').trim();
  if (!address) return null;
  const price = typeof home.price === 'number' && home.price > 0 ? home.price : null;
  if (!price) return null;

  const beds = typeof home.beds === 'number' && home.beds > 0 ? home.beds : null;
  const baths = combineBaths(home.full_baths, home.half_baths);
  const sqft = typeof home.sqft === 'number' && home.sqft > 0 ? home.sqft : null;

  const planName = home.floorplan?.name ?? home.floorplan?.feed_name ?? null;
  const neighborhood = cleanNeighborhood(home.neighborhood);

  // Title: "<address> — <plan> plan — <Builder>"  (omit plan if missing)
  const titleBase = planName
    ? `${address} — ${planName} plan`
    : address;
  const title = `${titleBase} — ${builderName}`;

  // Description: prefer Pipsy's marketing_description, augmented with key
  // facts that may not appear in marketing copy.
  const cleanedMarketing = cleanDescription(home.marketing_description);
  const meta: string[] = [];
  meta.push(`Built by ${builderName}.`);
  if (planName) meta.push(`Plan: ${planName}.`);
  if (home.stories) meta.push(`${home.stories}-story.`);
  if (beds && baths != null && home.garage != null) {
    meta.push(`${beds} bed / ${baths} bath / ${home.garage}-car garage.`);
  }
  if (sqft) meta.push(`${sqft.toLocaleString()} sq ft.`);
  if (home.was_price && home.was_price > price) {
    const savings = home.was_price - price;
    meta.push(`Was $${home.was_price.toLocaleString()} — now $${price.toLocaleString()} (save $${savings.toLocaleString()}).`);
  }
  const status = (home.lot_status || '').trim();
  if (status) meta.push(`Status: ${status}.`);
  const moveIn = epochToIso(home.move_in_date);
  if (moveIn) meta.push(`Move-in: ${moveIn}.`);

  const description = [meta.join(' '), cleanedMarketing].filter(Boolean).join(' ');

  // Images: cap, keep order Pipsy returns.
  const images = Array.isArray(home.images) ? home.images.filter(Boolean) : [];
  const gallery = images.slice(0, MAX_GALLERY);
  const thumbnail = images[0] ?? null;

  // Detail link — Pipsy's shop-homes widget uses an in-page selection
  // model, not URL routing, but the home anchor `#home-<id>` is what
  // their built-in share button generates.
  const detailUrl = `${SHOP_HOMES_URL}#home-${home.id}`;

  return {
    externalId: `lacima/pipsy-${home.id}`,
    kind: 'listing',
    publication: 'realtyline',
    submittedByName: 'La Cima Auto-Importer',
    submittedByEmail: 'scraper-la-cima@harmonyone.system',
    builderName: 'La Cima',
    title,
    city: LA_CIMA_CITY,
    state: LA_CIMA_STATE,
    description: description || null,
    bedsMin: beds,
    bedsMax: beds,
    bathsMin: baths,
    bathsMax: baths,
    sqftMin: sqft,
    sqftMax: sqft,
    priceMin: price,
    priceMax: price,
    flyerPdfUrl: detailUrl,
    thumbnailUrl: thumbnail,
    galleryUrls: gallery.length > 0 ? gallery : null,
    address: `${address}, ${LA_CIMA_CITY}, ${LA_CIMA_STATE}`,
    readyDate: moveIn,
    planName,
    communityName: neighborhood ? `La Cima · ${neighborhood}` : 'La Cima',
    homeType: 'showcase',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchLaCima(): Promise<LaCimaScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { reason: string; address?: string; id?: number }[] = [];
  let rawCount = 0;
  const seenIds = new Set<string>();

  let data: PipsyResponse;
  try {
    data = await fetchPipsyData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`La Cima Pipsy fetch failed: ${msg}`);
  }

  const homes = Array.isArray(data.available) ? data.available : [];
  rawCount = homes.length;

  for (const home of homes) {
    const row = buildRow(home);
    if (!row) {
      skipped.push({
        reason: 'missing required field (id/builder/address/price)',
        id: home.id,
        address: home.address ?? undefined,
      });
      continue;
    }
    if (seenIds.has(row.externalId)) {
      skipped.push({ reason: 'duplicate Pipsy id in feed', id: home.id });
      continue;
    }
    seenIds.add(row.externalId);
    rows.push(row);
  }

  // Synthetic community summary row so La Cima surfaces on /communities
  // (which filters home_type='community'). Same pattern as SRR.
  rows.unshift({
    externalId: 'lacima-developer/la-cima',
    kind: 'listing',
    publication: 'realtyline',
    submittedByName: 'La Cima Auto-Importer',
    submittedByEmail: 'scraper-la-cima@harmonyone.system',
    builderName: 'La Cima',
    title: 'La Cima',
    city: LA_CIMA_CITY,
    state: LA_CIMA_STATE,
    description:
      'La Cima is a master-planned new home community in San Marcos at the start of the Texas Hill Country, ' +
      'on the I-35 corridor between Austin and San Antonio. The 2,400-acre community features 800 acres of ' +
      'open space, a 45-acre central park, 10+ miles of trails, three pools, and an amenity center. Homes ' +
      'are available from Ashton Woods, David Weekley Homes, Highland Homes, Newmark Homes, Perry Homes, ' +
      'and Pulte Homes.',
    bedsMin: null,
    bedsMax: null,
    bathsMin: null,
    bathsMax: null,
    sqftMin: null,
    sqftMax: null,
    priceMin: null,
    priceMax: null,
    flyerPdfUrl: 'https://lacimatx.com/',
    thumbnailUrl: COMMUNITY_HERO_IMAGE,
    galleryUrls: null,
    address: null,
    readyDate: null,
    planName: null,
    communityName: 'La Cima',
    homeType: 'community',
  });
  rawCount += 1;

  return { rows, rawCount, skipped };
}
