// caxton-mailing-v1
// RealtyTexas.com aggregated realtor scraper.
//
// Source: https://www.realtytexas.com/real-search
//   Server-side rendered Texas realtor directory aggregating TREC + every
//   Texas MLS (SABOR, HAR, NTR, ACTRIS, CTEXAS, BCS) into a single Azure
//   Search index. Each page embeds the search results as a JSON array
//   ({"@search.score":..., Name, Email, Phone, License_*, Source, ...})
//   directly in the HTML — no authentication, no postbacks, no cookies.
//
// Strategy:
//   1. Page through the directory using `search=<letter>` + `&page=N`
//      (or `search=` + `&page=N` for a full walk). top=100 per page.
//   2. Parse the {"@search.score":...} objects out of the HTML by walking
//      balanced braces (cheaper than regex; survives nested quotes).
//   3. Filter to SABOR-territory records: Source=="MLS: SABOR" OR
//      PostalCode begins with "78" (Bexar / surrounding counties).
//   4. Normalize → SaborMemberRecord (compatible with existing upsert).
//
// Each list page takes ~1-2s. Walking a-z is ~26 letters × maybe 10 pages
// each = 260 requests ≈ 5-10 minutes. Massively faster than the prior
// authenticated SABOR scraper (~90 minutes for 1,500 records).

import { type SaborMemberRecord, SaborAuthError } from './sabor-realtor-scraper';

const SEARCH_URL = 'https://www.realtytexas.com/real-search';
const TOP_PER_PAGE = 100;
const DEFAULT_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Set of letters to walk for an exhaustive sweep.
const SEARCH_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Re-export the auth-error type so callers still catch a SaborAuthError on
// upstream failures. We keep the existing SaborMemberRecord shape so the
// ingest endpoint and DB columns don't need to change.
export { SaborAuthError };
export type { SaborMemberRecord };

// ============================================================
// Public types
// ============================================================

export interface RealtyTexasScrapeOptions {
  /** Cap on records ingested; default unlimited. */
  maxRecords?: number;
  /** Cap on list pages fetched per letter; default 30. */
  maxPagesPerLetter?: number;
  /** Cap on letters (a-z) walked; default 26. */
  maxLetters?: number;
  /** Inter-request delay (ms); default 300. */
  delayMs?: number;
  /**
   * SABOR filter mode:
   *  - 'sabor': keep records where Source === 'MLS: SABOR'
   *  - 'sabor-or-78xxx': keep MLS:SABOR OR PostalCode starts with '78'
   *  - 'all': no filter
   * Default 'sabor-or-78xxx'.
   */
  filter?: 'sabor' | 'sabor-or-78xxx' | 'all';
  /** Status filter; default 'Active'. Pass 'all' to keep everything. */
  statusFilter?: 'Active' | 'all';
  /** Require non-empty email? Default true. */
  requireEmail?: boolean;
  onProgress?: (info: {
    phase: 'list';
    letter: string;
    page: number;
    fetched: number;
    kept: number;
  }) => void;
}

export interface RealtyTexasScrapeResult {
  records: SaborMemberRecord[];
  recordsScanned: number;
  pagesScraped: number;
  lettersScanned: number;
  errors: number;
  truncated: boolean;
}

// ============================================================
// Raw record schema (subset — full schema has 41 fields)
// ============================================================

interface RawRealtyTexasRecord {
  '@search.score'?: number;
  Source?: string;
  Type?: string;
  Key_or_License?: string;
  License_Issued?: string;
  License_Expires?: string;
  Status?: string;
  Name?: string;
  Firm?: string;
  Firm_License_Number?: string;
  Phone?: string;
  Phone2?: string;
  Phone3?: string;
  Email?: string;
  Address1?: string;
  Address2?: string;
  City?: string;
  State?: string;
  PostalCode?: string;
  OfficeSource?: string;
  OfficeType?: string;
  Office_Key_or_License?: string;
  OfficeStatus?: string;
  OfficeName?: string;
  OfficePhone?: string;
  OfficeEmail?: string;
  OfficeAddress?: string;
  OfficeCity?: string;
  OfficeState?: string;
  OfficePostalCode?: string;
  pk?: string;
  fk?: string;
  MemberKeyNumeric?: number | null;
  OfficeKeyNumeric?: number | null;
  trec_id?: number | null;
  updated_at?: string;
  created_at?: string;
  UID?: string;
  UID_Table?: string;
}

// ============================================================
// HTTP + parsing
// ============================================================

async function fetchPage(letter: string, page: number): Promise<string> {
  const params = new URLSearchParams({
    orderby: 'Name',
    dir: 'asc',
    search: letter,
    SearchFields: 'All',
    Status: 'all',
    top: String(TOP_PER_PAGE),
    page: String(page),
  });
  const url = `${SEARCH_URL}?${params.toString()}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ctl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`RealtyTexas HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk balanced braces starting at `start` (which must be at a '{' char).
 * Returns the raw JSON substring including the outer braces, or null.
 */
function extractBalancedObject(html: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  const max = Math.min(start + 50_000, html.length);
  for (let j = start; j < max; j++) {
    const c = html[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (c === '"' && !esc) inStr = !inStr;
    if (inStr) continue;
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, j + 1);
    }
  }
  return null;
}

function parsePage(html: string): RawRealtyTexasRecord[] {
  const records: RawRealtyTexasRecord[] = [];
  const needle = '{"@search.score":';
  let i = 0;
  while (true) {
    const idx = html.indexOf(needle, i);
    if (idx < 0) break;
    const raw = extractBalancedObject(html, idx);
    if (!raw) {
      i = idx + needle.length;
      continue;
    }
    try {
      records.push(JSON.parse(raw) as RawRealtyTexasRecord);
    } catch {
      // skip malformed
    }
    i = idx + raw.length;
  }
  return records;
}

// ============================================================
// Normalization
// ============================================================

function normalizeWhitespace(s: string | null | undefined): string | null {
  if (s == null) return null;
  const out = String(s).replace(/\s+/g, ' ').trim();
  return out.length ? out : null;
}

function splitName(fullName: string): { first: string; last: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function pickPhone(...phones: (string | undefined | null)[]): string | null {
  for (const p of phones) {
    const v = normalizeWhitespace(p);
    if (v && v.length >= 7) return v;
  }
  return null;
}

function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  // Strip obvious placeholders
  const lc = s.toLowerCase();
  if (lc.includes('sampleemail') || lc.includes('noemail') || lc.endsWith('@no.com')) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizeRecord(raw: RawRealtyTexasRecord): SaborMemberRecord | null {
  const name = normalizeWhitespace(raw.Name);
  if (!name) return null;

  const email = isValidEmail(raw.Email) ? raw.Email!.trim() : null;
  const license = normalizeWhitespace(raw.Key_or_License);
  const company = normalizeWhitespace(raw.Firm || raw.OfficeName);
  const memberType = normalizeWhitespace(raw.Type);
  const source = normalizeWhitespace(raw.Source);

  // External ID priority: MemberKeyNumeric > pk > license
  let externalId: string | null = null;
  if (raw.MemberKeyNumeric) externalId = `mkn-${raw.MemberKeyNumeric}`;
  else if (raw.pk) externalId = `pk-${raw.pk}`;
  else if (license) externalId = `lic-${license}`;
  if (!externalId) return null;

  const { first, last } = splitName(name);
  return {
    external_id: externalId,
    external_source: 'ramco-sabor',
    first_name: first,
    last_name: last,
    full_name: name,
    email,
    phone: pickPhone(raw.Phone, raw.Phone2, raw.Phone3),
    mobile: null,
    company,
    title: null,
    license_number: license,
    address: normalizeWhitespace(raw.Address1) ??
      normalizeWhitespace(raw.OfficeAddress),
    city: normalizeWhitespace(raw.City) ?? normalizeWhitespace(raw.OfficeCity),
    state: normalizeWhitespace(raw.State) ?? normalizeWhitespace(raw.OfficeState),
    zip: normalizeWhitespace(raw.PostalCode) ??
      normalizeWhitespace(raw.OfficePostalCode),
    office_phone: normalizeWhitespace(raw.OfficePhone),
    county: null,
    designations: null,
    specialties: null,
    languages: null,
    member_type: memberType ? `${memberType}${source ? ` (${source})` : ''}` : source,
    board: source && source.toLowerCase().includes('sabor') ? 'SABOR' : null,
    website: null,
  };
}

function passesFilter(
  raw: RawRealtyTexasRecord,
  filter: NonNullable<RealtyTexasScrapeOptions['filter']>,
): boolean {
  if (filter === 'all') return true;
  const source = (raw.Source ?? '').toLowerCase();
  const zip = raw.PostalCode ?? '';
  if (source === 'mls: sabor') return true;
  if (filter === 'sabor-or-78xxx' && zip.startsWith('78')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// Public entry
// ============================================================

export async function scrapeRealtyTexas(
  opts: RealtyTexasScrapeOptions = {},
): Promise<RealtyTexasScrapeResult> {
  const maxRecords = opts.maxRecords;
  const maxPagesPerLetter = opts.maxPagesPerLetter ?? 30;
  const maxLetters = Math.min(opts.maxLetters ?? SEARCH_LETTERS.length, SEARCH_LETTERS.length);
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const filter = opts.filter ?? 'sabor-or-78xxx';
  const statusFilter = opts.statusFilter ?? 'Active';
  const requireEmail = opts.requireEmail !== false;
  const onProgress = opts.onProgress;

  const records: SaborMemberRecord[] = [];
  const seenIds = new Set<string>();
  let recordsScanned = 0;
  let pagesScraped = 0;
  let errors = 0;
  let truncated = false;

  outer: for (let li = 0; li < maxLetters; li++) {
    const letter = SEARCH_LETTERS[li];
    let consecutiveEmptyPages = 0;
    for (let page = 1; page <= maxPagesPerLetter; page++) {
      let html: string;
      try {
        html = await fetchPage(letter, page);
      } catch (err) {
        errors += 1;
        console.warn(
          `  [list] fetch error letter=${letter} page=${page}:`,
          err instanceof Error ? err.message : String(err),
        );
        // bail this letter on repeated errors
        if (errors > 10) {
          truncated = true;
          break outer;
        }
        await sleep(delayMs);
        continue;
      }
      pagesScraped += 1;
      const raws = parsePage(html);
      recordsScanned += raws.length;

      let kept = 0;
      for (const raw of raws) {
        if (statusFilter !== 'all' && raw.Status !== statusFilter) continue;
        if (!passesFilter(raw, filter)) continue;
        if (requireEmail && !isValidEmail(raw.Email)) continue;
        const rec = normalizeRecord(raw);
        if (!rec) continue;
        if (seenIds.has(rec.external_id)) continue;
        seenIds.add(rec.external_id);
        records.push(rec);
        kept += 1;
      }

      onProgress?.({
        phase: 'list',
        letter,
        page,
        fetched: records.length,
        kept,
      });

      // Stop conditions
      if (raws.length === 0) {
        consecutiveEmptyPages += 1;
        if (consecutiveEmptyPages >= 2) break; // end of this letter's results
      } else {
        consecutiveEmptyPages = 0;
      }

      if (maxRecords && records.length >= maxRecords) {
        truncated = true;
        break outer;
      }

      // If the page returned fewer than top, we've hit the last page
      if (raws.length < TOP_PER_PAGE) break;

      await sleep(delayMs);
    }
  }

  return {
    records,
    recordsScanned,
    pagesScraped,
    lettersScanned: Math.min(maxLetters, SEARCH_LETTERS.length),
    errors,
    truncated,
  };
}
