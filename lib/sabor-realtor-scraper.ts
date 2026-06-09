// caxton-mailing-v1
// SABOR (San Antonio Board of REALTORS) member directory scraper.
//
// Source: https://ramco.sabor.com/Membership/Directory/MemberSearch.aspx?membertype=<GUID>
//   ASP.NET WebForms app with Telerik RadGrid. Requires authenticated
//   session cookies (ASP.NET_SessionId + .RAMCOAUTH) from a logged-in
//   sabor.com / OneAccess session.
//
// Strategy:
//   1. GET search page (renders empty form)
//   2. POST searchButton click → grid populates (page 1 of 150, ~10/page)
//   3. Loop: POST __EVENTTARGET=resultsGrid, __EVENTARGUMENT=Page$N
//      preserving the complete form state from the previous response
//   4. Extract mid GUIDs from MemberDetails.aspx anchors
//   5. GET MemberDetails.aspx?mid=<mid> per ID, parse <tr> label/value rows
//   6. Normalize → SaborMemberRecord for upsertHoldingContacts
//
// Each postback takes ~33s (server is slow). Designed to run from a
// long-lived environment (GitHub Actions, local cron, etc.) — NOT
// from Vercel functions (5-min max).

import * as cheerio from 'cheerio';

const BASE_URL = 'https://ramco.sabor.com';
const SEARCH_URL = `${BASE_URL}/Membership/Directory/MemberSearch.aspx`;
const DETAIL_URL = `${BASE_URL}/Membership/Directory/MemberDetails.aspx`;
const MEMBER_TYPE_REALTOR = '804c987f-2b58-e711-9c12-00155d63043d';
const GRID_TARGET = 'ctl00$FormContentPlaceHolder$editForm$resultsGrid';
const SEARCH_BUTTON =
  'ctl00$FormContentPlaceHolder$editForm$initialSearchButtonStrip$searchButton';
const DEFAULT_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 90_000; // postbacks take ~33s
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============================================================
// Public types
// ============================================================

export interface SaborMemberRecord {
  external_id: string;
  external_source: 'ramco-sabor';
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  title: string | null;
  license_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  office_phone: string | null;
  county: string | null;
  designations: string | null;
  specialties: string | null;
  languages: string | null;
  member_type: string | null;
  board: string | null;
  website: string | null;
}

export interface SaborScrapeOptions {
  memberType?: string;
  maxRecords?: number;
  /** Cap on list pages to fetch; default 200 (covers ~2000 members at 10/page). */
  maxPages?: number;
  delayMs?: number;
  sessionId?: string;
  ramcoAuth?: string;
  /** When true, fetches each member's detail page; default true. */
  fetchDetails?: boolean;
  onProgress?: (info: {
    phase: 'list' | 'detail';
    page?: number;
    fetched: number;
    total?: number;
  }) => void;
}

export interface SaborScrapeResult {
  records: SaborMemberRecord[];
  memberIdsFound: number;
  pagesScraped: number;
  detailsFetched: number;
  truncated: boolean;
  errors: number;
}

export class SaborAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaborAuthError';
  }
}

// ============================================================
// Internal helpers
// ============================================================

function buildCookieHeader(sessionId: string, ramcoAuth: string): string {
  return `ASP.NET_SessionId=${sessionId}; .RAMCOAUTH=${ramcoAuth}`;
}

function baseHeaders(cookie: string): Record<string, string> {
  return {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://sabor.com/',
    Cookie: cookie,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeLoginPage(html: string): boolean {
  const lc = html.toLowerCase();
  if (lc.includes('resultsgrid')) return false;
  if (lc.includes('id="login"') || lc.includes('name="login"')) return true;
  if (lc.includes('action="/login') || lc.includes('action="login.aspx"')) return true;
  if (lc.includes('please sign in') || lc.includes('please log in')) return true;
  if (lc.includes('session has expired') || lc.includes('session expired')) return true;
  if (lc.includes('<title>oneaccess')) return true;
  return false;
}

/**
 * Capture full form state from a response so subsequent postbacks
 * carry the correct __VIEWSTATE / __EVENTVALIDATION / textbox values.
 */
function collectFormState($: cheerio.CheerioAPI): Record<string, string> {
  const state: Record<string, string> = {};
  $('form input').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    if (!name) return;
    const type = ($el.attr('type') || 'text').toLowerCase();
    if (type === 'submit' || type === 'image' || type === 'button') return;
    if (type === 'checkbox' || type === 'radio') {
      if ($el.attr('checked') !== undefined) {
        state[name] = $el.attr('value') ?? 'on';
      }
      return;
    }
    state[name] = $el.attr('value') ?? '';
  });
  $('form select').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    if (!name) return;
    const sel = $el.find('option[selected]').attr('value');
    state[name] = sel ?? $el.find('option').first().attr('value') ?? '';
  });
  $('form textarea').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    if (!name) return;
    state[name] = $el.text() ?? '';
  });
  return state;
}

function extractMemberIds($: cheerio.CheerioAPI): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  $('a[href*="MemberDetails.aspx"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/mid=([a-f0-9-]{36})/i);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  });
  return ids;
}

/**
 * Parse pagination footer for current/total page count.
 * Looks for "<n> items in <m> pages" span.
 */
function extractPageInfo($: cheerio.CheerioAPI): { items: number; pages: number } | null {
  let result: { items: number; pages: number } | null = null;
  $('span').each((_, el) => {
    if (result) return;
    const txt = $(el).text().trim();
    const m = txt.match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);
    if (m) result = { items: parseInt(m[1], 10), pages: parseInt(m[2], 10) };
  });
  return result;
}

async function submitForm(
  body: Record<string, string>,
  memberType: string,
  cookie: string,
): Promise<string> {
  const url = `${SEARCH_URL}?membertype=${encodeURIComponent(memberType)}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      ...baseHeaders(cookie),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`SABOR postback HTTP ${res.status}`);
  const html = await res.text();
  if (looksLikeLoginPage(html)) {
    throw new SaborAuthError('SABOR session expired during postback');
  }
  return html;
}

// ============================================================
// Detail-page parser
// ============================================================

function normalizeWhitespace(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = s.replace(/\s+/g, ' ').trim();
  return out.length ? out : null;
}

function splitName(fullName: string): { first: string; last: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * Strip an HTML fragment, preserving <br> as newlines so multi-line
 * fields (e.g. address blocks) can be split back into city/state/zip.
 */
function htmlToLines(html: string): string[] {
  // Convert <br> to newlines BEFORE stripping other tags
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return stripped
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
]);

/**
 * Try to split a "City, ST 12345-6789" string. Returns null fields if it
 * doesn't match the expected pattern.
 */
function parseCityStateZip(line: string): {
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const m = line.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (m && US_STATES.has(m[2])) {
    return { city: m[1].trim(), state: m[2], zip: m[3] };
  }
  return { city: null, state: null, zip: null };
}

function parseDetailPage(html: string, mid: string): SaborMemberRecord | null {
  if (looksLikeLoginPage(html)) {
    throw new SaborAuthError('SABOR session expired while fetching member detail');
  }
  const $ = cheerio.load(html);

  // Stable ID prefix used by all Ramco/myAssociations Member detail labels.
  const prefix = 'FormContentPlaceHolder_Panel_memberDetails_';
  const textOf = (id: string): string | null =>
    normalizeWhitespace($(`#${prefix}${id}`).text());
  const innerOf = (id: string): string => $(`#${prefix}${id}`).html() ?? '';
  const linkOf = (id: string): string | null =>
    normalizeWhitespace($(`#${prefix}${id} a`).first().attr('href'));

  // Name + license live in memberNameLiteralli as plain text + <br> + license
  let fullName: string | null = null;
  let licenseNumber: string | null = null;
  const nameBlockHtml = innerOf('memberNameLiteralli');
  if (nameBlockHtml) {
    const lines = htmlToLines(nameBlockHtml);
    for (const line of lines) {
      const licMatch = line.match(/license[:\s#]*([A-Za-z0-9-]+)/i);
      if (licMatch) {
        licenseNumber = licMatch[1];
        continue;
      }
      if (!fullName && line.length > 1) fullName = line;
    }
  }
  // Fallback to <h1>/<h2>
  if (!fullName) {
    for (const tag of ['h1', 'h2']) {
      const txt = normalizeWhitespace($(tag).first().text());
      if (txt && txt !== 'Member Details' && txt.length > 2) {
        fullName = txt;
        break;
      }
    }
  }
  if (!fullName) return null;

  // Board / primary association
  const board = textOf('primaryAssociationLabel');

  // Address block: company link + street + city/state/zip lines
  let company: string | null = null;
  let address: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  const addrHtml = innerOf('addressLiteralli');
  if (addrHtml) {
    // company name is the anchor text (if any)
    const compAnchor = $('#' + prefix + 'addressLiteralli a').first();
    if (compAnchor.length) company = normalizeWhitespace(compAnchor.text());
    const lines = htmlToLines(addrHtml);
    // First line is the company (already captured); subsequent lines = street, city/st/zip
    const remaining = company ? lines.filter((l) => l !== company) : lines;
    for (const line of remaining) {
      const cz = parseCityStateZip(line);
      if (cz.state) {
        city = cz.city;
        state = cz.state;
        zip = cz.zip;
      } else if (!address) {
        address = line;
      } else {
        // additional address line — concat
        address = `${address}, ${line}`;
      }
    }
  }

  // Email — either an explicit email block or a mailto anchor anywhere
  let email: string | null = null;
  const emailHref = $(`#${prefix}emailLiteralli a[href^="mailto:"]`).attr('href');
  if (emailHref) {
    const m = emailHref.match(/^mailto:([^?]+)/i);
    if (m) email = m[1].trim();
  }
  if (!email) {
    const anyMailto = $('a[href^="mailto:"]').first().attr('href');
    if (anyMailto) {
      const m = anyMailto.match(/^mailto:([^?]+)/i);
      if (m) email = m[1].trim();
    }
  }
  if (!email) {
    const emailText = textOf('emailLiteralli');
    if (emailText && emailText.includes('@')) email = emailText;
  }

  // Phones
  const primaryPhone = textOf('contactLabel');
  const officePhone = textOf('officeLabel');
  // Some skins expose mobileLabel / cellLabel — try both, ignore if missing
  const mobile =
    textOf('mobileLabel') ?? textOf('cellLabel') ?? textOf('cellPhoneLabel') ?? null;

  // Website
  let website: string | null = null;
  const webHref = linkOf('webpageLabelli');
  if (webHref) {
    website = webHref;
  } else {
    const webText = textOf('webpageLabel');
    if (webText && /^https?:\/\//i.test(webText)) website = webText;
  }

  // Optional fields (may exist on some profiles)
  const designations =
    textOf('designationLabel') ??
    textOf('designationsLabel') ??
    null;
  const specialties = textOf('specialtyLabel') ?? textOf('specialtiesLabel') ?? null;
  const languages = textOf('languageLabel') ?? textOf('languagesLabel') ?? null;
  const county = textOf('countyLabel') ?? null;
  const memberType = textOf('memberTypeLabel') ?? null;

  const { first, last } = splitName(fullName);
  return {
    external_id: mid,
    external_source: 'ramco-sabor',
    first_name: first,
    last_name: last,
    full_name: fullName,
    email: email,
    phone: primaryPhone,
    mobile: mobile,
    company: company,
    title: null,
    license_number: licenseNumber,
    address: address,
    city: city,
    state: state,
    zip: zip,
    office_phone: officePhone,
    county: county,
    designations: designations,
    specialties: specialties,
    languages: languages,
    member_type: memberType,
    board: board,
    website: website,
  };
}

// ============================================================
// Public entry point
// ============================================================

export async function scrapeSaborRealtors(
  opts: SaborScrapeOptions = {},
): Promise<SaborScrapeResult> {
  const sessionId = opts.sessionId ?? process.env.RAMCO_SABOR_SESSION_ID;
  const ramcoAuth = opts.ramcoAuth ?? process.env.RAMCO_SABOR_AUTH;
  if (!sessionId || !ramcoAuth) {
    throw new SaborAuthError(
      'RAMCO_SABOR_SESSION_ID and RAMCO_SABOR_AUTH env vars must be set.',
    );
  }
  const memberType = opts.memberType ?? MEMBER_TYPE_REALTOR;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const maxRecords = opts.maxRecords;
  const maxPages = opts.maxPages ?? 200;
  const fetchDetails = opts.fetchDetails !== false;
  const cookie = buildCookieHeader(sessionId, ramcoAuth);
  const onProgress = opts.onProgress;

  // ── Step 1: GET initial search form ──
  const initial = await fetchWithTimeout(
    `${SEARCH_URL}?membertype=${encodeURIComponent(memberType)}`,
    { headers: baseHeaders(cookie) },
  );
  if (!initial.ok) throw new Error(`SABOR initial GET HTTP ${initial.status}`);
  let html = await initial.text();
  if (looksLikeLoginPage(html)) {
    throw new SaborAuthError('SABOR session expired (login page on initial GET)');
  }
  let $ = cheerio.load(html);

  // ── Step 2: POST search button click ──
  const searchState = collectFormState($);
  searchState.__EVENTTARGET = '';
  searchState.__EVENTARGUMENT = '';
  searchState.__LASTFOCUS = '';
  searchState[SEARCH_BUTTON] = 'Search';
  searchState['ctl00$FormContentPlaceHolder$editForm$memberTypePicklist'] = memberType;

  html = await submitForm(searchState, memberType, cookie);
  $ = cheerio.load(html);

  // ── Step 3: paginate via Page$N ──
  const allIds: string[] = [];
  const seenIds = new Set<string>();
  let pagesScraped = 0;
  let truncated = false;
  const pageInfo = extractPageInfo($);
  const totalPages = pageInfo ? pageInfo.pages : maxPages;
  const totalItems = pageInfo ? pageInfo.items : 0;

  // Page 1 IDs (already in current response)
  const page1Ids = extractMemberIds($);
  for (const id of page1Ids) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      allIds.push(id);
    }
  }
  pagesScraped = 1;
  onProgress?.({
    phase: 'list',
    page: 1,
    fetched: allIds.length,
    total: totalItems,
  });

  for (let page = 2; page <= Math.min(totalPages, maxPages); page++) {
    if (maxRecords && allIds.length >= maxRecords) {
      truncated = true;
      break;
    }
    const state = collectFormState($);
    state.__EVENTTARGET = GRID_TARGET;
    state.__EVENTARGUMENT = `Page$${page}`;
    state.__LASTFOCUS = '';
    // suppress the searchButton field which would re-trigger a fresh search
    delete state[SEARCH_BUTTON];

    try {
      html = await submitForm(state, memberType, cookie);
    } catch (err) {
      if (err instanceof SaborAuthError) throw err;
      // transient — break out, return what we have
      break;
    }
    $ = cheerio.load(html);
    const ids = extractMemberIds($);
    let addedThisPage = 0;
    for (const id of ids) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allIds.push(id);
        addedThisPage += 1;
      }
    }
    pagesScraped += 1;
    onProgress?.({
      phase: 'list',
      page,
      fetched: allIds.length,
      total: totalItems,
    });
    // if a page returned 0 new IDs we've hit the end (or stuck)
    if (addedThisPage === 0) break;
    await sleep(delayMs);
  }

  if (pagesScraped >= maxPages && totalPages > maxPages) truncated = true;

  // ── Step 4: detail-page fetches ──
  const records: SaborMemberRecord[] = [];
  let errors = 0;
  if (!fetchDetails) {
    return {
      records,
      memberIdsFound: allIds.length,
      pagesScraped,
      detailsFetched: 0,
      truncated,
      errors,
    };
  }

  const detailCap = maxRecords ? Math.min(allIds.length, maxRecords) : allIds.length;
  for (let i = 0; i < detailCap; i++) {
    const mid = allIds[i];
    const url =
      `${DETAIL_URL}?mid=${encodeURIComponent(mid)}` +
      `&backurl=${encodeURIComponent(
        `~/Membership/Directory/MemberSearch.aspx?membertype=${memberType}`,
      )}`;
    try {
      const res = await fetchWithTimeout(url, { headers: baseHeaders(cookie) });
      if (res.ok) {
        const detailHtml = await res.text();
        const rec = parseDetailPage(detailHtml, mid);
        if (rec) records.push(rec);
      } else {
        errors += 1;
      }
    } catch (err) {
      if (err instanceof SaborAuthError) throw err;
      errors += 1;
    }
    if ((i + 1) % 25 === 0 || i === detailCap - 1) {
      onProgress?.({ phase: 'detail', fetched: i + 1, total: detailCap });
    }
    await sleep(delayMs);
  }

  return {
    records,
    memberIdsFound: allIds.length,
    pagesScraped,
    detailsFetched: records.length,
    truncated,
    errors,
  };
}
