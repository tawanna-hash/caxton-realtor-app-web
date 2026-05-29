// lib/scrapers/la-cima.ts
//
// La Cima (developer) — move-in-ready (QMI) homes scraper.
//
// Source: https://lacimatx.com/available-new-home-inventory/
//
// Unlike Santa Rita Ranch — which is rendered by a hosted Pipsy widget that
// pulls from a public WordPress REST endpoint — the La Cima inventory page
// is hand-authored in WPBakery/Salient. The page itself ships fully
// server-rendered HTML; the embedded Pipsy script never actually mounts.
//
// Structure (per builder section on the page):
//   <h3>Highland Homes</h3>
//   ...
//   <div class="nectar-fancy-ul">
//     <strong>1005 Teakmilll Trail</strong>,
//     <span style="color:#ff0000">$469,000</span>,
//     Floorplan: Amberley; SQ.FT: 2083; 1 Story; 4/3/2; Complete: Ready Now!;
//     <strong>MLS 7485492</strong><br>
//     <a href="https://www.highlandhomes.com/.../702-179">View Builder Page</a>
//   </div>
//
// Each "fancy-ul" block is one inventory home; the most recent preceding
// <h3> identifies the builder. The "4/3/2" triplet is beds/baths/garage —
// baths can be decimal (e.g. "2.5") or two-digit "N.M" meaning N full +
// M half (e.g. "4.2" → 4 full + 2 half → 5.0 total). Extras may follow
// the garage value before the "; Complete:" separator.
//
// Some sections (e.g. Ashton Woods) ship only a "Explore available
// quick move-in homes at builder.com" placeholder — we skip those.
//
// La Cima is a master-planned developer aggregating homes from many
// builders. To match the Santa Rita Ranch behavior, we attribute the
// listing to builder_name='La Cima' and preserve the actual homebuilder
// in the title suffix + description. The public InventoryCard component
// already extracts the trailing " — Builder" off the title and uses it
// as the pill label for La Cima rows.

import type { UpsertScrapedInput } from '../builder-inventory';

const INVENTORY_URL =
  'https://lacimatx.com/available-new-home-inventory/';
const SITE_ORIGIN = 'https://lacimatx.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

const LA_CIMA_CITY = 'San Marcos';
const LA_CIMA_STATE = 'TX';

// Hero image for the synthetic community summary row.
// Sourced from the site logo asset; kept as-is so the value is stable
// and we don't depend on a hot-loaded image URL changing under us.
const COMMUNITY_HERO_IMAGE =
  'https://lacimatx.com/wp-content/uploads/v6-LaCima-Refresh2017_Horizontal-CMYK.png';

export type LaCimaScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { reason: string; address?: string; builder?: string }[];
};

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// Card text parsing
// ─────────────────────────────────────────────────────────────────────────

type ParsedCard = {
  address: string;
  price: number;
  plan: string | null;
  sqft: number | null;
  stories: number | null;
  beds: number | null;
  baths: number | null;       // already converted from "N.M" full+half to decimal total
  bathsDisplay: string | null; // raw "4.2" form for the source string
  garage: number | null;
  extras: string | null;
  complete: string | null;
  mls: string | null;
};

// "4.2" baths = 4 full + 2 half → 5.0; "2.5" baths is just 2.5.
// Heuristic: a single decimal digit followed by an integer ≤ 9 that
// would be implausible as a fraction (.6, .7, .8 mean ≥ 1 extra half bath,
// which is the same as a full bath — usually a typo of the builder).
// Real-world examples we've seen: "3.2" "4.2" "4.4". We always treat
// the digit after the dot as a half-bath count when it's > 0.
function normalizeBaths(raw: string): { value: number | null; display: string } {
  const display = raw.trim();
  const m = display.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return { value: null, display };
  const full = parseInt(m[1], 10);
  const halfStr = m[2];
  if (!halfStr) return { value: full, display };
  // ".5" is the conventional half-bath form; everything else we interpret
  // as a half-bath count (e.g. ".2" = 2 half baths).
  if (halfStr === '5') return { value: full + 0.5, display };
  const halves = parseInt(halfStr, 10);
  if (!Number.isFinite(halves)) return { value: full, display };
  return { value: full + halves * 0.5, display };
}

function parseCardText(text: string): ParsedCard | null {
  // Address + price.
  const m1 = text.match(/^([^,]+),\s*\$([\d,]+)/);
  if (!m1) return null;
  const address = m1[1].trim();
  const price = parseInt(m1[2].replace(/,/g, ''), 10);
  if (!Number.isFinite(price) || price <= 0) return null;

  // Floorplan.
  const fp = text.match(/Floorplan:\s*([^;]+);/i);
  const plan = fp ? fp[1].trim() : null;

  // SQ.FT.
  const sf = text.match(/SQ\.?FT:?\s*([\d,]+)/i);
  const sqft = sf
    ? (() => {
        const n = parseInt(sf[1].replace(/,/g, ''), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      })()
    : null;

  // Stories.
  const st = text.match(/(\d+)\s*Story/i);
  const stories = st
    ? (() => {
        const n = parseInt(st[1], 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      })()
    : null;

  // Beds / baths / garage, optionally followed by extras up to "; Complete".
  // Example: "3/2.5/2, Study, Entertainment; Complete:"
  const bb = text.match(
    /;\s*(\d+)\s*\/\s*([\d.]+)\s*\/\s*(\d+)([^;]*?)\s*;\s*Complete/i,
  );
  let beds: number | null = null;
  let baths: number | null = null;
  let bathsDisplay: string | null = null;
  let garage: number | null = null;
  let extras: string | null = null;
  if (bb) {
    const b = parseInt(bb[1], 10);
    if (Number.isFinite(b) && b > 0) beds = b;
    const bres = normalizeBaths(bb[2]);
    baths = bres.value;
    bathsDisplay = bres.display;
    const g = parseInt(bb[3], 10);
    if (Number.isFinite(g) && g >= 0) garage = g;
    if (bb[4]) extras = bb[4].replace(/^,\s*/, '').trim() || null;
  }

  // Completion status.
  const c = text.match(/Complete:\s*([^;]+?)(?:;|$)/i);
  const complete = c ? c[1].trim() : null;

  // MLS number. Some cards say "MLS Coming Soon!" rather than a number.
  const ml = text.match(/MLS\s+([A-Za-z0-9]+(?:\s+(?:Coming|Soon))?\s*!?)/i);
  const mls = ml
    ? ml[1].replace(/View Builder Page/, '').trim()
    : null;

  return { address, price, plan, sqft, stories, beds, baths, bathsDisplay, garage, extras, complete, mls };
}

// Map "Ready Now!" / "READY NOW!" / "June 2026" / "May 2026" → ISO date or null.
function parseReadyDate(complete: string | null): string | null {
  if (!complete) return null;
  const c = complete.trim();
  if (/ready\s*now/i.test(c)) {
    // "Ready Now" — use today's date.
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }
  // "June 2026" / "Sept 2026"
  const m = c.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i,
  );
  if (m) {
    const months: Record<string, string> = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    };
    const mm = months[m[1].toLowerCase()];
    const yyyy = m[2];
    if (mm) return `${yyyy}-${mm}-01`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Page parsing
// ─────────────────────────────────────────────────────────────────────────

// Pull the inner text of a node — strip tags, collapse whitespace.
function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Walk the page in document order. Each <h3> sets the current builder
// section; each <div class="nectar-fancy-ul"> is one card under that
// builder. We do this with a tokenizing pass over the raw HTML to avoid
// pulling in a full HTML parser dependency just for this one file. The
// markup is stable WP Bakery output.
type WalkItem =
  | { kind: 'builder'; name: string }
  | { kind: 'card'; html: string; link: string | null };

function walkInventory(html: string): WalkItem[] {
  const items: WalkItem[] = [];

  // 1. <h3>...</h3> headers. We exclude the page hero h3 ("New Home Inventory")
  //    and any obvious non-builder phrases.
  const h3Regex = /<h3\b[^>]*>([\s\S]*?)<\/h3>/g;
  const h3s: { idx: number; name: string }[] = [];
  for (const m of html.matchAll(h3Regex)) {
    const name = stripTags(m[1]);
    if (!name) continue;
    if (/inventory|promotion|new home/i.test(name)) continue;
    h3s.push({ idx: m.index ?? 0, name });
  }

  // 2. <div class="nectar-fancy-ul" ...>...</div> cards. We extract the
  //    inner text + first anchor href.
  const cardRegex = /<div[^>]*class="[^"]*\bnectar-fancy-ul\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const cards: { idx: number; html: string; link: string | null }[] = [];
  for (const m of html.matchAll(cardRegex)) {
    const inner = m[1];
    const linkM = inner.match(/<a[^>]*\bhref="([^"]+)"/i);
    cards.push({ idx: m.index ?? 0, html: inner, link: linkM ? linkM[1] : null });
  }

  // 3. Merge by document position so each card is attached to its preceding builder.
  let bi = 0;
  for (const c of cards) {
    while (bi + 1 < h3s.length && h3s[bi + 1].idx < c.idx) bi++;
    const builderName = bi < h3s.length && h3s[bi].idx < c.idx ? h3s[bi].name : null;
    if (builderName) {
      if (items.length === 0 || items[items.length - 1].kind !== 'builder' ||
          (items[items.length - 1] as { kind: 'builder'; name: string }).name !== builderName) {
        items.push({ kind: 'builder', name: builderName });
      }
    }
    items.push({ kind: 'card', html: c.html, link: c.link });
  }
  return items;
}

// Slugify any string into a stable identifier component.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchLaCima(): Promise<LaCimaScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { reason: string; address?: string; builder?: string }[] = [];

  let html: string;
  try {
    html = await fetchHtml(INVENTORY_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`La Cima inventory fetch failed: ${msg}`);
  }

  const items = walkInventory(html);
  let rawCount = 0;
  const seenIds = new Set<string>();

  let currentBuilder: string | null = null;
  for (const it of items) {
    if (it.kind === 'builder') {
      currentBuilder = it.name;
      continue;
    }
    if (it.kind !== 'card') continue;
    rawCount++;

    if (!currentBuilder) {
      skipped.push({ reason: 'card before any builder header' });
      continue;
    }

    const text = stripTags(it.html);

    // Skip the "Explore available quick move-in homes at builder.com"
    // placeholder rows — they have no per-home data.
    if (
      !/\$\d/.test(text) ||
      /\bExplore available\b/i.test(text) ||
      /\bquick move-in homes at\b/i.test(text)
    ) {
      skipped.push({ reason: 'placeholder (no listings yet)', builder: currentBuilder });
      continue;
    }

    const parsed = parseCardText(text);
    if (!parsed) {
      skipped.push({
        reason: 'could not parse card text',
        builder: currentBuilder,
      });
      continue;
    }

    // External ID: prefer MLS when numeric, then fall back to builder/addr slug.
    let externalId: string;
    if (parsed.mls && /^\d+$/.test(parsed.mls)) {
      externalId = `lacima/${slugify(currentBuilder)}/${parsed.mls}`;
    } else {
      externalId = `lacima/${slugify(currentBuilder)}/${slugify(parsed.address)}`;
    }
    if (seenIds.has(externalId)) {
      // Duplicate address in the same builder section — append price for uniqueness.
      externalId = `${externalId}-${parsed.price}`;
    }
    seenIds.add(externalId);

    const fullAddress = `${parsed.address}, ${LA_CIMA_CITY}, ${LA_CIMA_STATE}`;
    const builderForTitle = currentBuilder;
    const titleBase = parsed.plan
      ? `${parsed.address} — ${parsed.plan} plan`
      : parsed.address;
    const title = `${titleBase} — ${builderForTitle}`;

    const descParts: string[] = [];
    descParts.push(`Built by ${builderForTitle}.`);
    if (parsed.plan) descParts.push(`Plan: ${parsed.plan}.`);
    if (parsed.stories) {
      descParts.push(`${parsed.stories}-story.`);
    }
    if (parsed.beds && parsed.bathsDisplay && parsed.garage != null) {
      descParts.push(`${parsed.beds} bed / ${parsed.bathsDisplay} bath / ${parsed.garage}-car garage.`);
    }
    if (parsed.extras) descParts.push(`Includes: ${parsed.extras}.`);
    if (parsed.sqft) descParts.push(`${parsed.sqft.toLocaleString()} sq ft.`);
    if (parsed.complete) descParts.push(`Ready: ${parsed.complete}.`);
    if (parsed.mls) descParts.push(`MLS ${parsed.mls}.`);
    const description = descParts.join(' ');

    // Detail URL: the "View Builder Page" anchor on the card.
    const detailUrl = it.link && it.link.startsWith('http')
      ? it.link
      : it.link && it.link.startsWith('/')
        ? SITE_ORIGIN + it.link
        : null;

    rows.push({
      externalId,
      kind: 'listing',
      publication: 'realtyline',
      submittedByName: 'La Cima Auto-Importer',
      submittedByEmail: 'scraper-la-cima@harmonyone.system',
      builderName: 'La Cima',
      title,
      city: LA_CIMA_CITY,
      state: LA_CIMA_STATE,
      description,
      bedsMin: parsed.beds,
      bedsMax: parsed.beds,
      bathsMin: parsed.baths,
      bathsMax: parsed.baths,
      sqftMin: parsed.sqft,
      sqftMax: parsed.sqft,
      priceMin: parsed.price,
      priceMax: parsed.price,
      flyerPdfUrl: detailUrl,
      thumbnailUrl: null,
      address: fullAddress,
      readyDate: parseReadyDate(parsed.complete),
      planName: parsed.plan,
      communityName: 'La Cima',
      homeType: 'showcase',
    });
  }

  // Synthetic community summary row so La Cima surfaces on /communities
  // (which filters on home_type='community'). Same pattern as SRR.
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
    address: null,
    readyDate: null,
    planName: null,
    communityName: 'La Cima',
    homeType: 'community',
  });
  rawCount += 1;

  return { rows, rawCount, skipped };
}
