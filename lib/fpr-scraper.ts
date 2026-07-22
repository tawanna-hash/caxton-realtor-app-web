// caxton-events-v1
// FPR (Five Points Board of REALTORS) calendar scraper.
//
// Source: https://fivepointsrealtors.com/calendar/
//
// The page embeds the full event list as inline JS variables in its static
// HTML response — no client-side fetch is needed. We grab the page with a
// plain fetch() and extract two variables:
//
//   var rapcalSourceEvents  = { "events": [...] };  // blue cards   (#ea580c)
//   var rapcalSourceClasses = { "events": [...] };  // purple cards (#7a1f7e)
//
// Both are valid JSON once the {...} body is sliced out. A third variable,
// rapcalSourceEventsAndClasses, uses an unquoted `events` key (not valid
// JSON), so we skip it and concatenate the first two.
//
// This file replaced an earlier Playwright-based draft. Plain fetch works
// because the data is server-rendered into the page; only the calendar's
// visual widget (FullCalendar) needs JS to paint. We don't need the widget,
// just the data behind it.

import { createHash } from 'crypto';
import type { EventInput } from './events-store';

const BASE = 'https://fivepointsrealtors.com';
const CALENDAR_URL = `${BASE}/calendar/`;

const PUBLICATION = 'austin' as const;
const SOURCE = 'fpr' as const;
const EVENT_NAME_PREFIX = 'Five Points: ';

// Title prefixes the RAPAMS feed adds; redundant once `format` encodes
// virtual vs. in-person. Stripped from titles, preserved in description
// when the editorial reviewer needs to see the original framing.
const TITLE_PREFIX_RE =
  /^\s*(FREE\s+ZOOM|ZOOM|IN\s+PERSON|VIRTUAL|FREE\s+MEMBER\s+BENEFIT)\s*:\s*/i;

// Tokens that should remain ALL CAPS during title-casing.
const KNOWN_ACRONYMS = new Set([
  'TREC', 'GRI', 'MLS', 'NAR', 'CTXMLS', 'TRLP', 'CE', 'FPR', 'YPN',
  'BOD', 'IABS', 'TAR', 'ABR', 'CRS', 'SRS', 'PSA', 'SRES', 'AHWD',
  'C2EX', 'RPR', 'RPAC', 'TREPAC', 'IDX',
]);

// Connectors that stay lowercase mid-title.
const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on',
  'or', 'the', 'to', 'with', 'vs', 'via',
]);

// FPR location codes → friendly name + address + virtual flag. Per
// project §5; extend as new codes appear in the feed. Unknown codes
// log a warning and pass through with empty address.
interface LocationInfo {
  name: string;
  address: string;
  isVirtual: boolean;
}
const LOCATION_LOOKUP: Record<string, LocationInfo> = {
  WCR: {
    name: 'Five Points Board of REALTORS',
    address: '123 E. Old Settlers Blvd., Round Rock, TX 78664',
    isVirtual: false,
  },
  ZOOM: { name: 'Virtual / Zoom', address: '', isVirtual: true },
  Z1:   { name: 'Virtual / Zoom', address: '', isVirtual: true },
  ZM01: { name: 'Virtual / Zoom (Room 1)', address: '', isVirtual: true },
  ZM02: { name: 'Virtual / Zoom (Room 2)', address: '', isVirtual: true },
  // HB01 appears on community-tour and bus-tour events. Likely a partner
  // builder site; flag as in-person without an address until confirmed.
  HB01: { name: 'HB01 (Builder Site)', address: '', isVirtual: false },
};

// ------------------------------ helpers ------------------------------------

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Return the America/Chicago UTC offset for a given local date as
 * `±HH:MM`. Used to attach a real offset to the naïve local timestamps
 * the RAPAMS feed sends (e.g. "2026-05-13T10:00:00").
 *
 * Implemented via Intl.DateTimeFormat with timeZoneName: 'shortOffset'
 * because Node has no built-in tz-aware Date constructor and we don't
 * want to add a dependency.
 */
function getCentralOffset(year: number, month: number, day: number): string {
  const probe = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  });
  const tzPart = fmt.formatToParts(probe).find((p) => p.type === 'timeZoneName');
  const raw = tzPart?.value || 'GMT-6';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
  if (!m) return '-06:00';
  return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
}

function isoFromLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const offset = getCentralOffset(year, month, day);
  return (
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`
  );
}

/**
 * Convert a naïve local timestamp from the RAPAMS feed (e.g.
 * "2026-05-13T10:00:00") into an ISO 8601 string with America/Chicago
 * offset. Returns null if the input is missing or unparseable.
 */
function naiveLocalToIso(naive: string | null | undefined): string | null {
  if (!naive) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive);
  if (!m) return null;
  return isoFromLocal(
    parseInt(m[1], 10),
    parseInt(m[2], 10),
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
  );
}

// ------------------------------ normalization ------------------------------

/**
 * RAPAMS sends event titles in ALL CAPS. Convert to title case while
 * preserving known acronyms (TREC, MLS, NAR, etc.) and roman numerals.
 * Strips ZOOM:/FREE ZOOM:/IN PERSON:/FREE MEMBER BENEFIT: prefixes —
 * `format` and `description` carry that info. Enforces REALTOR/REALTORS
 * uppercase per NAR style (project §6, non-negotiable).
 */
export function normalizeTitle(raw: string): string {
  let t = clean(raw);
  if (!t) return t;

  // Strip leading prefix (preserved in description elsewhere).
  t = t.replace(TITLE_PREFIX_RE, '');

  // Decide whether to title-case: only act if the input is mostly uppercase.
  const letters = t.replace(/[^A-Za-z]/g, '');
  const upperCount = (t.match(/[A-Z]/g) || []).length;
  const upperRatio = letters.length ? upperCount / letters.length : 0;

  if (upperRatio > 0.7 && letters.length >= 4) {
    const words = t.split(/(\s+)/); // keep whitespace tokens
    const out: string[] = [];
    let wordIndex = 0;
    for (const tok of words) {
      if (/^\s+$/.test(tok)) {
        out.push(tok);
        continue;
      }
      // Strip leading/trailing punctuation for classification, keep it on output.
      const lead = (tok.match(/^[^A-Za-z0-9]+/) || [''])[0];
      const tail = (tok.match(/[^A-Za-z0-9]+$/) || [''])[0];
      // If lead+tail spans the whole token (i.e. token is all punctuation
      // like a standalone "-"), emit it verbatim — otherwise lead and tail
      // overlap and double the punctuation.
      if (lead.length + tail.length >= tok.length) {
        out.push(tok);
        wordIndex += 1;
        continue;
      }
      const core = tok.slice(lead.length, tok.length - tail.length);
      const upper = core.toUpperCase();

      let cased: string;
      if (KNOWN_ACRONYMS.has(upper)) {
        cased = upper;
      } else if (/^[IVX]+$/i.test(core)) {
        // Roman numerals (e.g. "II" in "TREC LEGAL UPDATE II").
        cased = upper;
      } else if (
        wordIndex > 0 &&
        SMALL_WORDS.has(core.toLowerCase())
      ) {
        cased = core.toLowerCase();
      } else {
        cased = core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
      }
      out.push(`${lead}${cased}${tail}`);
      wordIndex += 1;
    }
    t = out.join('');
  }

  // REALTOR/REALTORS → uppercase always (NAR style, non-negotiable per §6).
  t = t.replace(/\bRealtors?\b/gi, (m) => m.toUpperCase());

  // Trim trailing punctuation/whitespace.
  t = t.replace(/[.,;:!?\-\u2010-\u2015\u2212\s]+$/, '');

  return t.trim();
}

/** RAPAMS instructor placeholders (`. .`, `..`, blanks) → empty string. */
function dropInstructorPlaceholder(raw: string | null | undefined): string {
  if (!raw) return '';
  const t = clean(raw);
  if (!t) return '';
  if (/^\.+(\s*\.+)*$/.test(t)) return ''; // ". ." or ".."
  return t;
}

/**
 * Map FPR location code → location string + virtual flag + address.
 * Unknown codes log a warning and pass through with empty address (§5).
 */
function resolveLocation(code: string): {
  locationString: string;
  isVirtual: boolean;
  address: string;
} {
  const key = (code || '').trim().toUpperCase();
  const hit = LOCATION_LOOKUP[key];
  if (!hit) {
    if (key) {
      console.warn(`[fpr] unknown location code: ${key}`);
    }
    return { locationString: key, isVirtual: false, address: '' };
  }
  const locationString = hit.address ? `${hit.name} \u2014 ${hit.address}` : hit.name;
  return { locationString, isVirtual: hit.isVirtual, address: hit.address };
}

/**
 * Derive event category from card color and the Committee flag.
 *   - Committee:"Y"   → "Committees" (overrides color)
 *   - color #ea580c   → "Events"
 *   - color #7a1f7e   → "Classes"
 * Anything else → "" (caller falls back to leaving it blank).
 */
function deriveCategory(color: string | null, committee: string | null): string {
  if (committee && committee.trim().toUpperCase() === 'Y') return 'Committees';
  if (!color) return '';
  const c = color.toLowerCase();
  if (c === '#ea580c') return 'Events';
  if (c === '#7a1f7e') return 'Classes';
  return '';
}

/** Stable external_id: RAPAMS event id when present, else hash of key fields. */
function stableExternalId(
  rapamsId: string | null,
  title: string,
  startIso: string | null,
): string {
  if (rapamsId) return `rapams:${rapamsId}`;
  const seed = `${title}|${startIso || ''}`;
  return `hash:${createHash('sha1').update(seed).digest('hex').slice(0, 16)}`;
}

// ------------------------------ fetch + extract ----------------------------

/**
 * Plain HTTP GET of the calendar page. The page returns the full event
 * data inline as JS variables, so no headless browser is needed.
 */
async function fetchCalendarPage(): Promise<string> {
  const res = await fetch(CALENDAR_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; CaxtonScraper/1.0; +https://myrealtyline.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`FPR calendar fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/** Shape of a single entry inside `rapcalSourceEvents` / `rapcalSourceClasses`. */
interface RawRapamsEntry {
  title?: string;
  start?: string | null;
  end?: string | null;
  Event_ID?: string | null;
  Location?: string | null;
  Status?: string | null;
  Maximum_Attendees?: number | null;
  Num_Registered?: number | null;
  Open_To_Public?: string | null;
  color?: string | null;
  url?: string | null;
  instructor?: string | null;
  eventDetailLink?: string | null;
  eventGuestRegistration?: string | null;
  Web_Description_Full?: string | null;
  Committee?: string | null;
}

/**
 * Find a JS variable assignment by name and return its right-hand-side
 * object as a balanced {...} substring, ready for JSON.parse. Returns
 * null if the variable is missing or its braces don't balance.
 *
 * Walks character-by-character so nested objects don't fool us — a
 * non-greedy regex match would stop at the first `}` inside an event
 * object, which is wrong for an array of events.
 *
 * Honors double-quoted strings so `}` inside a string value doesn't
 * decrement the depth counter. Backslash-escaped quotes are skipped
 * properly.
 */
export function findVarObject(html: string, varName: string): string | null {
  const startMarker = `var ${varName}`;
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) return null;

  // Find the first `{` after the variable name + `=`.
  const braceIdx = html.indexOf('{', startIdx + startMarker.length);
  if (braceIdx < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = braceIdx; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; }
      else if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(braceIdx, i + 1);
    }
  }
  return null;
}

/**
 * Pull the event arrays out of `rapcalSourceEvents` and
 * `rapcalSourceClasses` and return them concatenated. Each variable's
 * shape is `{ "events": [ ... ] }`.
 *
 * If a variable is missing or its JSON doesn't parse, log a warning and
 * skip it — the other one is still useful on its own.
 */
export function extractEmbeddedEvents(html: string): RawRapamsEntry[] {
  const out: RawRapamsEntry[] = [];

  for (const varName of ['rapcalSourceEvents', 'rapcalSourceClasses']) {
    const body = findVarObject(html, varName);
    if (!body) {
      console.warn(`[fpr] could not find ${varName} on the calendar page`);
      continue;
    }
    let parsed: { events?: RawRapamsEntry[] };
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      console.warn(
        `[fpr] failed to JSON.parse ${varName}: ${(err as Error).message}`,
      );
      continue;
    }
    if (Array.isArray(parsed?.events)) {
      out.push(...parsed.events);
    }
  }

  return out;
}

// ------------------------------ map + transform ----------------------------

/**
 * Intermediate shape between the raw RAPAMS JSON and the final
 * EventInput. Keeps `rawTitle` separate from the cleaned title so
 * buildDescription() can decide whether to preserve the original prefix.
 */
interface RapamsEvent {
  rapamsId: string | null;
  rawTitle: string;
  startIso: string | null;
  endIso: string | null;
  locationCode: string;
  status: string;             // friendly: "Open" / "Tentative" / etc.
  spacesAvailable: number | null;
  instructor: string;
  category: string;           // "Events" / "Classes" / "Committees" / ""
  detailUrl: string | null;
  registrationUrl: string | null;
}

function rawToRapamsEvent(raw: RawRapamsEntry): RapamsEvent {
  // RAPAMS Status code → friendly label. "A" = active/open. A blank
  // status (single space or empty) means provisional/unconfirmed; per
  // editorial decision we surface those as "Tentative" rather than
  // dropping them, so reviewers see them and can decide.
  const statusRaw = (raw.Status || '').trim();
  let status: string;
  if (statusRaw === 'A') status = 'Open';
  else if (statusRaw === '') status = 'Tentative';
  else status = statusRaw;

  // Spaces available: max - registered, clamped at 0.
  let spacesAvailable: number | null = null;
  if (
    typeof raw.Maximum_Attendees === 'number' &&
    typeof raw.Num_Registered === 'number'
  ) {
    spacesAvailable = Math.max(0, raw.Maximum_Attendees - raw.Num_Registered);
  }

  // Detail URL: feed sends a relative path like "/eventdetails/26GTCU".
  let detailUrl: string | null = null;
  if (raw.url) {
    try {
      detailUrl = new URL(raw.url, BASE).toString();
    } catch {
      detailUrl = null;
    }
  }

  return {
    rapamsId: raw.Event_ID ? clean(raw.Event_ID) : null,
    rawTitle: raw.title || '',
    startIso: naiveLocalToIso(raw.start),
    endIso: naiveLocalToIso(raw.end),
    locationCode: (raw.Location || '').trim().toUpperCase(),
    status,
    spacesAvailable,
    instructor: raw.instructor || '',
    category: deriveCategory(raw.color || null, raw.Committee || null),
    detailUrl,
    registrationUrl: raw.eventDetailLink || null,
  };
}

/**
 * Build the description shown to editorial reviewers. Preserves the
 * original ZOOM:/IN PERSON: prefix (per §6) so editors can see the
 * source framing, plus instructor, status, and seat count.
 */
function buildDescription(ev: RapamsEvent): string | null {
  const parts: string[] = [];
  if (ev.rawTitle && TITLE_PREFIX_RE.test(ev.rawTitle)) {
    parts.push(`Original title: ${clean(ev.rawTitle)}`);
  }
  const inst = dropInstructorPlaceholder(ev.instructor);
  if (inst) parts.push(`Instructor: ${inst}`);
  if (ev.status) parts.push(`Status: ${ev.status}`);
  if (ev.spacesAvailable != null) {
    parts.push(`Spaces available: ${ev.spacesAvailable}`);
  }
  return parts.length ? parts.join('\n') : null;
}

/** Map a parsed RapamsEvent into the EventInput shape the events store uses. */
function toEventInput(ev: RapamsEvent): EventInput | null {
  const title = normalizeTitle(ev.rawTitle);
  if (!title || !ev.startIso) return null;

  const loc = resolveLocation(ev.locationCode);
  const instructor = dropInstructorPlaceholder(ev.instructor);

  return {
    externalSource: SOURCE,
    externalId: stableExternalId(ev.rapamsId, title, ev.startIso),
    publication: PUBLICATION,
    title: `${EVENT_NAME_PREFIX}${title}`,
    description: buildDescription(ev),
    link: ev.registrationUrl || ev.detailUrl || null,
    startDate: ev.startIso,
    endDate: ev.endIso,
    location: loc.isVirtual ? null : (loc.locationString || null),
    organizer: null,
    organizerEmail: null,
    website: ev.registrationUrl || null,
    tags: ev.category || null,
    format: loc.isVirtual ? 'Virtual' : 'In-Person',
    courseNumber: null,
    memberPrice: null,
    nonmemberPrice: null,
    imageUrl: null,
    imageThumb: null,
    instructorName: instructor || null,
    instructorBio: null,
    lat: null,
    lng: null,
  };
}

// ------------------------------ orchestration ------------------------------

/**
 * Top-level entry point. Fetches the FPR calendar page, extracts the
 * embedded JS event variables, normalizes each entry, and returns the
 * EventInputs whose start date falls within the next `months` and
 * after now.
 *
 * Filters applied (in order):
 *   1. Open_To_Public !== "Y"  → skipped (member-only entries)
 *   2. unparseable / titleless → skipped
 *   3. start date in the past  → skipped
 *   4. start date beyond cutoff → skipped
 *   5. duplicate external_id   → skipped (within one run)
 *
 * Logs a one-line summary at the end so the cron output is grep-able.
 */
export async function scrapeFpr(months = 12): Promise<EventInput[]> {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() + months);

  const html = await fetchCalendarPage();
  const rawEntries = extractEmbeddedEvents(html);

  const out: EventInput[] = [];
  const seen = new Set<string>();
  let skippedNotPublic = 0;
  let skippedInvalid = 0;
  let skippedPast = 0;
  let skippedFuture = 0;

  for (const raw of rawEntries) {
    if (raw.Open_To_Public !== 'Y') {
      skippedNotPublic += 1;
      continue;
    }

    const ev = rawToRapamsEvent(raw);
    const ei = toEventInput(ev);
    if (!ei) {
      skippedInvalid += 1;
      continue;
    }

    if (ei.startDate) {
      const startDate = new Date(ei.startDate);
      if (startDate < now) { skippedPast += 1; continue; }
      if (startDate > cutoff) { skippedFuture += 1; continue; }
    }

    if (seen.has(ei.externalId)) continue;
    seen.add(ei.externalId);
    out.push(ei);
  }

  console.log(
    `[fpr] parsed ${rawEntries.length} entries → ${out.length} events ` +
    `(skipped: ${skippedNotPublic} not-public, ${skippedInvalid} invalid, ` +
    `${skippedPast} past, ${skippedFuture} beyond ${months}-mo cutoff)`,
  );

  return out;
}
