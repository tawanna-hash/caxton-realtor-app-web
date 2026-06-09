// caxton-mailing-v1
// SABOR (San Antonio Board of REALTORS) public member directory scraper.
//
// Source: https://ramco.sabor.com/Membership/Directory/MemberSearch.aspx
//   ASP.NET WebForms application that is publicly accessible via the
//   sabor.com Find-a-REALTOR iframe — no member login required. A fresh
//   ASP.NET_SessionId cookie is issued on first GET; we just hold onto it
//   for the rest of the run.
//
// Strategy:
//   1. GET search page → captures ASP.NET_SessionId from Set-Cookie
//   2. POST searchButton click (blank filters → all REALTORS) → page 1
//   3. Loop: POST __EVENTTARGET=resultsGrid, __EVENTARGUMENT=Page$N
//      preserving __VIEWSTATE / __EVENTVALIDATION from the previous response
//   4. Extract mid GUIDs from MemberDetails.aspx anchors
//   5. GET MemberDetails.aspx?mid=<mid> per ID, parse <tr> label/value rows
//   6. Normalize → SaborMemberRecord for upsertHoldingContacts
//
// NOTE: The public view does NOT expose email addresses. Records carry
// name / license / company / address / phones only. Emails are gathered
// via the on-site verify form (lib/sabor-mls/verify) when realtors claim
// their profile.
//
// Designed for long-lived environments (GitHub Actions, local cron).
// Each list POST takes ~22s server-side; detail GETs are ~1-3s each.
// Full run = 150 list pages + 1500 detail GETs ≈ 60-90 minutes.

import * as cheerio from 'cheerio';

const BASE_URL = 'https://ramco.sabor.com';
const SEARCH_URL = `${BASE_URL}/Membership/Directory/MemberSearch.aspx`;
const DETAIL_URL = `${BASE_URL}/Membership/Directory/MemberDetails.aspx`;
const OUTER_REFERER =
  'https://sabor.com/buying-selling-and-renting/for-buyers/find-a-sabor-realtor/';
const MEMBER_TYPE_REALTOR = '804c987f-2b58-e711-9c12-00155d63043d';
const GRID_TARGET = 'ctl00$FormContentPlaceHolder$editForm$resultsGrid';
const SEARCH_BUTTON =
  'ctl00$FormContentPlaceHolder$editForm$initialSearchButtonStrip$searchButton';
const MEMBER_TYPE_FIELD =
  'ctl00$FormContentPlaceHolder$editForm$memberTypePicklist';
const DEFAULT_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 90_000; // postbacks take ~22-33s
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
// Cookie jar (per-run, in-memory)
// ============================================================

class CookieJar {
  private store = new Map<string, string>();

  apply(setCookie: string[] | undefined): void {
    if (!setCookie || setCookie.length === 0) return;
    for (const raw of setCookie) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      this.store.set(name, value);
    }
  }

  header(): string {
    if (this.store.size === 0) return '';
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  has(name: string): boolean {
    return this.store.has(name);
  }
}

// ============================================================
// HTTP helpers
// ============================================================

function baseHeaders(jar: CookieJar): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: OUTER_REFERER,
  };
  const cookie = jar.header();
  if (cookie) h.Cookie = cookie;
  return h;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET with manual redirect handling so we can read Set-Cookie on the 302
 * (the bootstrap response sets ASP.NET_SessionId and redirects to itself
 * without the querystring).
 */
async function getFollow(url: string, jar: CookieJar, maxHops = 3): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    const res = await fetchWithTimeout(current, {
      method: 'GET',
      headers: baseHeaders(jar),
      redirect: 'manual',
    });
    jar.apply(res.headers.getSetCookie?.());
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects starting at ${url}`);
}

async function postFollow(
  url: string,
  body: string,
  jar: CookieJar,
  maxHops = 3,
): Promise<Response> {
  let res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      ...baseHeaders(jar),
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
    },
    body,
    redirect: 'manual',
  });
  jar.apply(res.headers.getSetCookie?.());
  // Follow GET redirects
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    if (!(res.status >= 300 && res.status < 400)) return res;
    const loc = res.headers.get('location');
    if (!loc) return res;
    current = new URL(loc, current).toString();
    res = await fetchWithTimeout(current, {
      method: 'GET',
      headers: baseHeaders(jar),
      redirect: 'manual',
    });
    jar.apply(res.headers.getSetCookie?.());
  }
  return res;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeLoginPage(html: string): boolean {
  const lc = html.toLowerCase();
  // resultsgrid presence ⇒ we got the search page back, definitively not login
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

function htmlToLines(html: string): string[] {
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

  const prefix = 'FormContentPlaceHolder_Panel_memberDetails_';
  const textOf = (id: string): string | null =>
    normalizeWhitespace($(`#${prefix}${id}`).text());
  const innerOf = (id: string): string => $(`#${prefix}${id}`).html() ?? '';
  const linkOf = (id: string): string | null =>
    normalizeWhitespace($(`#${prefix}${id} a`).first().attr('href'));

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

  const board = textOf('primaryAssociationLabel');

  let company: string | null = null;
  let address: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  const addrHtml = innerOf('addressLiteralli');
  if (addrHtml) {
    const compAnchor = $('#' + prefix + 'addressLiteralli a').first();
    if (compAnchor.length) company = normalizeWhitespace(compAnchor.text());
    const lines = htmlToLines(addrHtml);
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
        address = `${address}, ${line}`;
      }
    }
  }

  // Email — public view almost never exposes this, but keep parser intact
  // in case some profiles opt in.
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

  const primaryPhone = textOf('contactLabel');
  const officePhone = textOf('officeLabel');
  const mobile =
    textOf('mobileLabel') ?? textOf('cellLabel') ?? textOf('cellPhoneLabel') ?? null;

  let website: string | null = null;
  const webHref = linkOf('webpageLabelli');
  if (webHref) {
    website = webHref;
  } else {
    const webText = textOf('webpageLabel');
    if (webText && /^https?:\/\//i.test(webText)) website = webText;
  }

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
// Session bootstrap
// ============================================================

/**
 * Initial GET → returns the Member Search form HTML with a fresh
 * ASP.NET_SessionId cookie attached to the jar. Follows the 302 that
 * ASP.NET issues when querystrings are present.
 */
async function bootstrapSession(jar: CookieJar, memberType: string): Promise<string> {
  // First touch picks up the cookie even if the server 302s
  const first = await getFollow(
    `${SEARCH_URL}?membertype=${encodeURIComponent(memberType)}`,
    jar,
  );
  if (!first.ok) throw new Error(`SABOR initial GET HTTP ${first.status}`);
  const html = await first.text();
  if (looksLikeLoginPage(html)) {
    throw new SaborAuthError('SABOR returned a login page on initial GET');
  }
  if (!jar.has('ASP.NET_SessionId')) {
    throw new SaborAuthError(
      'SABOR did not issue ASP.NET_SessionId — public endpoint may have changed',
    );
  }
  return html;
}

async function submitForm(body: Record<string, string>, jar: CookieJar): Promise<string> {
  const res = await postFollow(SEARCH_URL, new URLSearchParams(body).toString(), jar);
  if (!res.ok) throw new Error(`SABOR postback HTTP ${res.status}`);
  const html = await res.text();
  if (looksLikeLoginPage(html)) {
    throw new SaborAuthError('SABOR session expired during postback');
  }
  return html;
}

// ============================================================
// Public entry point
// ============================================================

export async function scrapeSaborRealtors(
  opts: SaborScrapeOptions = {},
): Promise<SaborScrapeResult> {
  const memberType = opts.memberType ?? MEMBER_TYPE_REALTOR;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const maxRecords = opts.maxRecords;
  const maxPages = opts.maxPages ?? 200;
  const fetchDetails = opts.fetchDetails !== false;
  const onProgress = opts.onProgress;
  const jar = new CookieJar();

  // ── Step 1: bootstrap session (no auth) ──
  let html = await bootstrapSession(jar, memberType);
  let $ = cheerio.load(html);

  // ── Step 2: POST search button click ──
  const searchState = collectFormState($);
  searchState.__EVENTTARGET = '';
  searchState.__EVENTARGUMENT = '';
  searchState.__LASTFOCUS = '';
  searchState[SEARCH_BUTTON] = 'Search';
  searchState[MEMBER_TYPE_FIELD] = memberType;

  html = await submitForm(searchState, jar);
  $ = cheerio.load(html);

  // ── Step 3: paginate via Page$N ──
  const allIds: string[] = [];
  const seenIds = new Set<string>();
  let pagesScraped = 0;
  let truncated = false;
  const pageInfo = extractPageInfo($);
  const totalPages = pageInfo ? pageInfo.pages : maxPages;
  const totalItems = pageInfo ? pageInfo.items : 0;

  const page1Ids = extractMemberIds($);
  for (const id of page1Ids) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      allIds.push(id);
    }
  }
  pagesScraped = 1;

  if (page1Ids.length === 0) {
    const lc = html.toLowerCase();
    const signals = {
      htmlBytes: html.length,
      hasResultsGrid: lc.includes('resultsgrid'),
      hasMemberDetailsAnchor: lc.includes('memberdetails.aspx'),
      hasOneAccess: lc.includes('oneaccess') || lc.includes('one-access'),
      hasLoginForm: lc.includes('id="login"') || lc.includes('name="login"'),
      hasNoRecordsText:
        lc.includes('no records to display') || lc.includes('no matching records'),
      pageInfo,
    };
    console.warn(
      '  [list] page 1 returned 0 ids — diagnostic signals:',
      JSON.stringify(signals),
    );
    const bodyMatch = html.match(/<body[^>]*>([\s\S]{0,1500})/i);
    if (bodyMatch) {
      const snippet = bodyMatch[1]
        .replace(/\s+/g, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .trim()
        .slice(0, 800);
      console.warn('  [list] body snippet:', snippet);
    }
  }
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
    delete state[SEARCH_BUTTON];

    try {
      html = await submitForm(state, jar);
    } catch (err) {
      if (err instanceof SaborAuthError) throw err;
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
      const res = await getFollow(url, jar);
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
