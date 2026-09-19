import {
  getSql,
  ensureSchema,
} from './db';
import {
  pruneStale,
  upsertMissingEventsByTitleDate,
  type EventInput,
} from './events-store';

const FEED_URL =
  'https://www.realtyline.us/wp-json/custom-calendar/v1/events?per_page=200';
const SOURCE = 'realtyline' as const;
const PUBLICATION = 'austin' as const;
const FETCH_TIMEOUT_MS = 20_000;

interface RealtyLineEvent {
  id: number;
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  organizer?: string;
  organizer_email?: string;
  course_number?: string;
  event_format?: string;
  category?: string;
  url?: string;
}

function clean(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function getCentralOffset(year: number, month: number, day: number): string {
  const probe = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  });
  const part = formatter
    .formatToParts(probe)
    .find((candidate) => candidate.type === 'timeZoneName');
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(
    part?.value || 'GMT-6',
  );
  if (!match) return '-06:00';
  return `${match[1]}${match[2].padStart(2, '0')}:${match[3] || '00'}`;
}

function centralWallClockToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  const offset = getCentralOffset(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
  return (
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:` +
    `${match[6] || '00'}${offset}`
  );
}

function centralToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export async function scrapeRealtyLineCalendar(): Promise<EventInput[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(FEED_URL, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`RealtyLine calendar returned ${response.status}`);
    }

    const rows = (await response.json()) as RealtyLineEvent[];
    const today = centralToday();
    return rows.flatMap((row): EventInput[] => {
      const title = clean(row.title);
      const startDate = centralWallClockToIso(row.start);
      if (!title || !startDate || startDate.slice(0, 10) < today) return [];

      return [{
        externalSource: SOURCE,
        externalId: String(row.id),
        publication: PUBLICATION,
        title,
        description: null,
        link: clean(row.url),
        startDate,
        endDate: centralWallClockToIso(row.end),
        location: clean(row.location),
        organizer: clean(row.organizer),
        organizerEmail: clean(row.organizer_email),
        website: clean(row.url),
        tags: clean(row.category),
        format: clean(row.event_format),
        courseNumber: clean(row.course_number),
      }];
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function syncRealtyLineCalendar() {
  const events = await scrapeRealtyLineCalendar();
  const counts = await upsertMissingEventsByTitleDate(events);
  const pruned = await pruneStale(SOURCE, 30);
  return { received: events.length, ...counts, pruned };
}

let initialization: Promise<void> | null = null;

/**
 * Bootstrap the feed after this feature first reaches production. Later
 * refreshes are handled by the daily cron and do not delay calendar reads.
 */
export function ensureRealtyLineCalendarInitialized(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM events
      WHERE external_source = ${SOURCE}
        AND COALESCE(end_date, start_date) >= NOW()
    `) as unknown as Array<{ count: number }>;
    if (Number(rows[0]?.count || 0) > 0) return;
    await syncRealtyLineCalendar();
  })().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
