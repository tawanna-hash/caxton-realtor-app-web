// caxton-mailing-v1
// ABoR / UnlockMLS realtor directory scraper.
//
// Source: https://www.search.unlockmls.com/realtor/agents/?page=N
//         Public Next.js page that embeds the full agent list as JSON in
//         <script id="__NEXT_DATA__">. Each page yields up to 300 agents
//         with email, phone, address, license, and office details — no
//         deep-mode profile crawl required.
//
// Strategy:
//   - GET each page sequentially (default delay 300ms between requests)
//   - Extract __NEXT_DATA__ JSON, pull props.pageProps.agents[]
//   - Stop when a page returns 0 agents OR we reach pageProps.agentCount
//   - Normalize each agent to a stable RealtorRecord shape ready to upsert
//     into mailing_contacts (segment='realtor', stage='holding')
//
// The "deep mode" from the Python reference isn't needed — the listing
// itself contains full contact details. We keep individual profile fetch
// as a future enhancement only if Media/extra fields become needed.
//
// External id = MemberKey (e.g. "ACT1492642"), external_source = 'unlockmls'.

const BASE = 'https://www.search.unlockmls.com/realtor/agents/';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const DEFAULT_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 30_000;
const AGENTS_PER_PAGE = 300; // observed; used only for bounds estimation

// ============================================================
// Public types
// ============================================================

/**
 * Normalized realtor record as ingested into mailing_contacts.holding.
 * All optional fields are nullable rather than empty strings so the DB
 * upsert keeps NULL semantics.
 */
export interface RealtorRecord {
  external_id: string;          // MemberKey
  external_source: 'unlockmls'; // discriminator
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;       // Office.OfficeName
  title: string | null;         // MemberType (Real Estate Agent / Managing Broker / Appraiser)
  license_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  office_phone: string | null;
  office_city: string | null;
  office_zip: string | null;
  aor: string | null;           // MemberAOR — e.g. "Austin Board Of Realtors"
}

export interface ScrapeOptions {
  /** Max pages to scrape; default 60 (covers ~18k agents at 300/page). */
  maxPages?: number;
  /** Delay between page fetches in ms; default 300. */
  delayMs?: number;
  /** Stop after this many records (useful for cron/test runs). */
  maxRecords?: number;
  /** Filter to a specific AOR substring, e.g. 'Austin'. */
  aorFilter?: string;
  /** Filter to specific city substring(s) (case-insensitive). */
  cityFilter?: string[];
  /** Optional callback invoked after each page completes. */
  onPage?: (page: number, count: number, total: number) => void;
}

export interface ScrapeResult {
  records: RealtorRecord[];
  pagesScraped: number;
  totalReportedByServer: number | null;
  truncated: boolean;
}

// ============================================================
// Internal helpers
// ============================================================

interface RawAgent {
  MemberKey?: string;
  MemberName?: string;
  MemberFullName?: string;
  MemberFirstName?: string;
  MemberLastName?: string;
  MemberEmail?: string;
  MemberDirectPhone?: string;
  MemberMobilePhone?: string;
  MemberAddress1?: string;
  MemberCity?: string;
  MemberStateOrProvince?: string;
  MemberPostalCode?: string;
  MemberType?: string;
  MemberStateLicense?: string;
  MemberAOR?: string;
  Office?: {
    OfficeName?: string;
    OfficeCity?: string;
    OfficePostalCode?: string;
    OfficePhone?: string;
  };
  TotalCount?: number;
}

interface NextDataShape {
  props?: {
    pageProps?: {
      agents?: RawAgent[];
      agentCount?: number;
    };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Fetch ${url} -> ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the `__NEXT_DATA__` JSON blob the Next.js page embeds.
 * Returns null when the page is not a Next-rendered shell (e.g.
 * upstream HTML error page).
 */
function extractNextData(html: string): NextDataShape | null {
  const re = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
  const m = re.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as NextDataShape;
  } catch {
    return null;
  }
}

function clean(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = String(v).replace(/\s+/g, ' ').trim();
  return t || null;
}

function emailOrNull(v: string | null | undefined): string | null {
  const c = clean(v);
  if (!c) return null;
  // Basic shape check; the server feed sometimes returns "n/a" placeholders.
  return /@/.test(c) ? c.toLowerCase() : null;
}

/**
 * Normalize a raw __NEXT_DATA__ agent record. The MemberFirstName/Last
 * fields are mostly populated, but we fall back to splitting MemberName
 * when either is missing.
 */
function normalize(raw: RawAgent): RealtorRecord | null {
  const memberKey = clean(raw.MemberKey);
  if (!memberKey) return null;

  let first = clean(raw.MemberFirstName);
  let last = clean(raw.MemberLastName);
  const full =
    clean(raw.MemberFullName) ||
    clean(raw.MemberName) ||
    [first, last].filter(Boolean).join(' ') ||
    '';
  if (!first && full) {
    const parts = full.split(/\s+/);
    first = parts[0] || null;
    last = parts.slice(1).join(' ') || null;
  }
  if (!first) return null; // we require at least a first name to persist

  const office = raw.Office ?? {};
  return {
    external_id: memberKey,
    external_source: 'unlockmls',
    first_name: first,
    last_name: last,
    full_name: full || first,
    email: emailOrNull(raw.MemberEmail),
    phone: clean(raw.MemberDirectPhone),
    mobile: clean(raw.MemberMobilePhone),
    company: clean(office.OfficeName),
    title: clean(raw.MemberType),
    license_number: clean(raw.MemberStateLicense),
    address: clean(raw.MemberAddress1),
    city: clean(raw.MemberCity),
    state: clean(raw.MemberStateOrProvince),
    zip: clean(raw.MemberPostalCode),
    office_phone: clean(office.OfficePhone),
    office_city: clean(office.OfficeCity),
    office_zip: clean(office.OfficePostalCode),
    aor: clean(raw.MemberAOR),
  };
}

function pageUrl(page: number): string {
  if (page <= 1) return BASE;
  return `${BASE}?page=${page}`;
}

// ============================================================
// Single-page fetch (exported for the manual sync route)
// ============================================================

/**
 * Fetch and parse a single page of realtor listings. Returns null when
 * the page can't be parsed (network error or HTML didn't include
 * __NEXT_DATA__). Returns an empty array when the page exists but has
 * no agents (signals end of pagination).
 */
export async function fetchAborRealtorPage(
  page: number,
): Promise<{ agents: RealtorRecord[]; reportedTotal: number | null } | null> {
  const html = await fetchHtml(pageUrl(page));
  const data = extractNextData(html);
  if (!data) return null;
  const raw = data.props?.pageProps?.agents ?? [];
  const total = data.props?.pageProps?.agentCount ?? null;
  const agents = raw
    .map(normalize)
    .filter((r): r is RealtorRecord => r !== null);
  return { agents, reportedTotal: total };
}

// ============================================================
// Multi-page orchestration
// ============================================================

/**
 * Scrape the public UnlockMLS realtor directory paginated. Designed to
 * run server-side (Node, edge or Vercel cron). Honors `maxRecords` and
 * `maxPages` to keep cron runs bounded.
 *
 * Deduplicates by external_id within the run (the upstream paginator
 * occasionally repeats records near page boundaries during indexing).
 */
export async function scrapeAborRealtors(
  opts: ScrapeOptions = {},
): Promise<ScrapeResult> {
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 60, 200));
  const delayMs = Math.max(0, opts.delayMs ?? DEFAULT_DELAY_MS);
  const maxRecords = opts.maxRecords && opts.maxRecords > 0 ? opts.maxRecords : Infinity;
  const aorFilter = opts.aorFilter?.toLowerCase() ?? null;
  const cityFilter = opts.cityFilter?.map((c) => c.toLowerCase()) ?? null;

  const out: RealtorRecord[] = [];
  const seenKeys = new Set<string>();
  let pagesScraped = 0;
  let totalReportedByServer: number | null = null;
  let truncated = false;

  for (let p = 1; p <= maxPages; p += 1) {
    let payload: Awaited<ReturnType<typeof fetchAborRealtorPage>> = null;
    try {
      payload = await fetchAborRealtorPage(p);
    } catch (err) {
      console.warn(`[abor-realtor] page ${p} fetch failed`, err);
      // Soft-fail: stop pagination but return what we have so far.
      break;
    }
    if (!payload) break;
    pagesScraped += 1;
    if (totalReportedByServer == null && payload.reportedTotal != null) {
      totalReportedByServer = payload.reportedTotal;
    }
    if (payload.agents.length === 0) break;

    for (const r of payload.agents) {
      if (seenKeys.has(r.external_id)) continue;
      if (aorFilter && !(r.aor || '').toLowerCase().includes(aorFilter)) continue;
      if (cityFilter && cityFilter.length > 0) {
        const city = (r.city || '').toLowerCase();
        if (!cityFilter.some((c) => city.includes(c))) continue;
      }
      seenKeys.add(r.external_id);
      out.push(r);
      if (out.length >= maxRecords) {
        truncated = true;
        break;
      }
    }

    if (opts.onPage) opts.onPage(p, payload.agents.length, out.length);
    if (truncated) break;

    // Stop early if we've fetched everything the server claims exists.
    if (
      totalReportedByServer != null &&
      pagesScraped * AGENTS_PER_PAGE >= totalReportedByServer
    ) {
      break;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return { records: out, pagesScraped, totalReportedByServer, truncated };
}
