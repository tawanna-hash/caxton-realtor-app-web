// caxton-events-v1
// HBA Austin (Home Builders Association) calendar scraper.
//
// Source: https://web.hbaaustin.com/atlas/calendar (powered by GrowthZone Atlas)
// API host:  https://api-internal.weblinkconnect.com
//
// The Atlas SPA fetches an anonymous JWT from a public security endpoint and
// then calls the Events API with that token. We replicate the same flow:
//
//   1. GET /api/Security/Public/AtlasMemberPortalSpa/Tenant/Current
//      Header: x-tenant-hostname: web.hbaaustin.com
//      Returns: { AccessToken, Tenant: "HBAGreaterAustinTXASSOC", HasError, Error }
//
//   2. GET /api/Events?<query parameters>
//      Headers: Authorization: Bearer <token>, x-tenant: <tenant>
//      Returns: { TotalCount, Result: [<event objects>] }
//
//   3. For each event, GET /api/Event/{eventId} to retrieve the long description.
//      Same auth headers as step 2.
//
// Why step 3 exists: the listing endpoint always returns Descr: null. The
// singular /Event/{id} endpoint is what the SPA hits for full event content;
// it's the cheapest way to enrich descriptions without scraping HTML. If a
// future API change leaves Descr null on this endpoint too, the scraper logs
// a "missing descriptions" count so we can swap to HTML scraping as v2.

import type { EventInput } from './events-store';

const API_HOST = 'https://api-internal.weblinkconnect.com';
const TENANT_HOSTNAME = 'web.hbaaustin.com';
const PUBLICATION = 'austin' as const;
const SOURCE = 'hba' as const;
const EVENT_NAME_PREFIX = 'HBA: ';

// Acronyms to keep ALL CAPS during light title cleanup. The Atlas API returns
// titles already mixed-case (unlike FPR's all-caps feed), so we only enforce
// case for these tokens rather than running a full title-casing pass.
const KNOWN_ACRONYMS = new Set([
  'HBA', 'NAHB', 'NAR', 'TREC', 'GRI', 'MLS', 'GRC', 'SMC', 'CBRC',
  'YPN', 'BOD', 'PWB', 'CGB', 'CSP', 'CGP', 'CAPS', 'CGA', 'CRS',
]);

// Heuristic for the `format` column. If any of these tokens appear in the
// venue/address/title, we mark the event Virtual; otherwise In-Person.
const VIRTUAL_RE = /\b(virtual|zoom|teams|webinar|online)\b/i;

const FETCH_TIMEOUT_MS = 20_000;
// Brief pause between detail enrichment calls to avoid tripping any rate
// limiting on the WeblinkConnect Cloudflare front. ~150 events at 150ms is
// well under the 300s Vercel maxDuration.
const REQUEST_DELAY_MS = 150;

// ------------------------------ helpers ------------------------------------

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HBA fetch ${url} -> ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------ auth ---------------------------------------

interface TempTokenResponse {
  AccessToken?: string;
  Tenant?: string;
  HasError?: boolean;
  Error?: string;
}

interface AuthContext {
  token: string;
  tenant: string;
}

/**
 * Fetch the anonymous "temp" access token the Atlas SPA uses for guest
 * (non-logged-in) calls. The endpoint takes the tenant hostname in a header
 * and returns both the JWT and the resolved tenant id we need on subsequent
 * Events calls.
 */
async function fetchAuthContext(): Promise<AuthContext> {
  const url = `${API_HOST}/api/Security/Public/AtlasMemberPortalSpa/Tenant/Current`;
  const data = await fetchJson<TempTokenResponse>(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-tenant-hostname': TENANT_HOSTNAME,
    },
    cache: 'no-store',
  });
  if (data.HasError) {
    throw new Error(`HBA auth failed: ${data.Error || 'unknown error'}`);
  }
  if (!data.AccessToken || !data.Tenant) {
    throw new Error('HBA auth returned no token or tenant id');
  }
  return { token: data.AccessToken, tenant: data.Tenant };
}

function authHeaders(auth: AuthContext): HeadersInit {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${auth.token}`,
    'x-tenant': auth.tenant,
    Origin: `https://${TENANT_HOSTNAME}`,
  };
}

// ------------------------------ listing ------------------------------------

interface RawEvent {
  EventId: number;
  EventName: string;
  EventType: string | null;
  Venue: string | null;
  Address1: string | null;
  Address2: string | null;
  City: string | null;
  State: string | null;
  Zip: string | null;
  Email: string | null;
  RelatedWebsite: string | null;
  imageUrl: null,
  StartDateTimeUtc: string;
  EndDateTimeUtc: string | null;
  IsAllDay: boolean;
  IsPublic: boolean;
  MembersOnly: boolean;
  Internal: boolean;
  Closed: boolean;
  IsRegistrationEnabled: boolean;
  Descr: string | null;       // null on /Events listing; populated on /Event/{id}
  ShortDescr: string | null;
}

interface EventsResponse {
  TotalCount: number;
  Result?: RawEvent[];
}

/**
 * Call /api/Events with the same query parameters the public SPA sends.
 * Date range is now → now+months. The API always returns events ordered
 * by start date ascending.
 */
async function fetchEventsListing(
  auth: AuthContext,
  months: number,
): Promise<RawEvent[]> {
  const start = new Date();
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + months);

  const params = new URLSearchParams({
    PageSize: '0',
    OrganizationEvent: 'true',
    CommunityEvent: 'true',
    MembersOnlyEvent: 'true',
    InternalEvent: 'false',
    SearchDateBegin: start.toISOString(),
    SearchDateEnd: end.toISOString(),
    EventClosed: 'false',
    GetEventSponsors: 'false',
  });
  const url = `${API_HOST}/api/Events?${params.toString()}`;

  const data = await fetchJson<EventsResponse>(url, {
    method: 'GET',
    headers: authHeaders(auth),
    cache: 'no-store',
  });
  return data.Result || [];
}

/**
 * Fetch a single event's full record so we can pull the description.
 * Failures are logged and swallowed so one bad event doesn't break the run —
 * the event still imports, just without a description.
 */
async function fetchEventDescription(
  auth: AuthContext,
  eventId: number,
): Promise<string | null> {
  const url = `${API_HOST}/api/Event/${eventId}`;
  try {
    const data = await fetchJson<RawEvent>(url, {
      method: 'GET',
      headers: authHeaders(auth),
      cache: 'no-store',
    });
    return cleanDescription(data.Descr || data.ShortDescr || null);
  } catch (err) {
    console.warn(`[hba] detail fetch failed for event ${eventId}:`, err);
    return null;
  }
}

// ------------------------------ normalization ------------------------------

/**
 * Convert any HTML in the description to clean plain text with paragraph
 * breaks preserved. The Atlas editor stores rich-text descriptions as HTML;
 * we strip tags but keep the structural cues for readability.
 */
export function cleanDescription(raw: string | null): string | null {
  if (!raw) return null;

  let text = raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text || null;
}

/**
 * Light title cleanup. Trims whitespace, enforces known acronyms in
 * uppercase, and strips trailing punctuation. We deliberately do NOT
 * run a full title-casing pass because the Atlas API titles are already
 * mixed-case (unlike FPR's all-caps feed).
 */
export function normalizeTitle(raw: string): string {
  let t = clean(raw);
  if (!t) return t;

  for (const acronym of KNOWN_ACRONYMS) {
    const re = new RegExp(`\\b${acronym}\\b`, 'gi');
    t = t.replace(re, acronym);
  }

  t = t.replace(/[.,;:!?\-\u2010-\u2015\u2212\s]+$/, '');
  return t.trim();
}

/** Compose a single readable location string from the API's split fields. */
function buildLocation(ev: RawEvent): string | null {
  const venue = clean(ev.Venue);
  const street = [clean(ev.Address1), clean(ev.Address2)]
    .filter(Boolean)
    .join(', ');
  const cityStateZip = [
    clean(ev.City),
    [clean(ev.State), clean(ev.Zip)].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const addr = [street, cityStateZip].filter(Boolean).join(', ');

  if (venue && addr) return `${venue} \u2014 ${addr}`;
  if (venue) return venue;
  if (addr) return addr;
  return null;
}

function deriveFormat(ev: RawEvent): string {
  const haystack = `${ev.Venue || ''} ${ev.Address1 || ''} ${ev.EventName || ''}`;
  return VIRTUAL_RE.test(haystack) ? 'Virtual' : 'In-Person';
}

function detailUrl(eventId: number): string {
  return `https://${TENANT_HOSTNAME}/atlas/events/${eventId}/details`;
}

function registrationUrl(ev: RawEvent): string | null {
  if (!ev.IsRegistrationEnabled) return null;
  return `https://${TENANT_HOSTNAME}/atlas/events-v4/register/${ev.EventId}`;
}

function toEventInput(ev: RawEvent, description: string | null): EventInput | null {
  const title = normalizeTitle(ev.EventName || '');
  if (!title || !ev.StartDateTimeUtc) return null;

  return {
    externalSource: SOURCE,
    externalId: `hba:${ev.EventId}`,
    publication: PUBLICATION,
    title: `${EVENT_NAME_PREFIX}${title}`,
    description,
    link: registrationUrl(ev) || detailUrl(ev.EventId),
    startDate: ev.StartDateTimeUtc,
    endDate: ev.EndDateTimeUtc || null,
    location: buildLocation(ev),
    organizer: 'Home Builders Association of Greater Austin',
    organizerEmail: clean(ev.Email) || null,
    website: registrationUrl(ev) || detailUrl(ev.EventId),
    tags: clean(ev.EventType) || null,
    format: deriveFormat(ev),
    courseNumber: null,
    memberPrice: null,
    nonmemberPrice: null,
    imageUrl: null,
    imageThumb: null,
    instructorName: null,
    instructorBio: null,
    lat: null,
    lng: null,
  };
}

// ------------------------------ orchestration ------------------------------

/**
 * Top-level entry point. Authenticates, fetches the listing, then enriches
 * each event with its description from the singular /Event/{id} endpoint.
 *
 * Filters applied (in order):
 *   1. Closed/Internal events  → skipped (shouldn't appear given query params,
 *                                belt-and-suspenders)
 *   2. unparseable / titleless → skipped
 *   3. start date in the past  → skipped (the API already filters but we
 *                                double-check in case of clock drift)
 *   4. duplicate external_id   → skipped (within one run)
 *
 * Logs a one-line summary so the cron output is grep-able.
 */
export async function scrapeHba(months = 12): Promise<EventInput[]> {
  const now = new Date();

  const auth = await fetchAuthContext();
  const raw = await fetchEventsListing(auth, months);

  const out: EventInput[] = [];
  const seen = new Set<string>();
  let skippedNonPublic = 0;
  let skippedInvalid = 0;
  let skippedPast = 0;
  let descMissing = 0;

  for (const ev of raw) {
    if (ev.Closed || ev.Internal) {
      skippedNonPublic += 1;
      continue;
    }

    const description = await fetchEventDescription(auth, ev.EventId);
    if (!description) descMissing += 1;
    await sleep(REQUEST_DELAY_MS);

    const ei = toEventInput(ev, description);
    if (!ei) {
      skippedInvalid += 1;
      continue;
    }

    if (ei.startDate) {
      const startDate = new Date(ei.startDate);
      if (startDate < now) { skippedPast += 1; continue; }
    }

    if (seen.has(ei.externalId)) continue;
    seen.add(ei.externalId);
    out.push(ei);
  }

  console.log(
    `[hba] parsed ${raw.length} entries → ${out.length} events ` +
    `(skipped: ${skippedNonPublic} non-public, ${skippedInvalid} invalid, ` +
    `${skippedPast} past; ${descMissing} missing descriptions)`,
  );

  return out;
}
