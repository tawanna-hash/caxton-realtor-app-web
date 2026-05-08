// caxton-events-v1
// Read/write API for the events table. The shape returned to the dashboard
// matches the `CalendarEvent` interface defined inline in the dashboard page,
// so no frontend type changes are needed.

import { ensureSchema, getSql } from './db';

export type Publication = 'austin' | 'san_antonio';
export type EventSource = 'unlockmls' | 'wordpress' | 'manual';

/** Public-facing shape — must match `CalendarEvent` in the dashboard. */
export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  link: string;
  publication: Publication;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  organizerEmail: string | null;
  website: string | null;
  tags: string | null;
  format: string | null;
  courseNumber: string | null;
  memberPrice: string | null;
  nonmemberPrice: string | null;
  imageUrl: string | null;
  imageThumb: string | null;
  lat: number | null;
  lng: number | null;
}

/** Input shape for upsertEvents — what scrapers produce. */
export interface EventInput {
  externalSource: EventSource;
  externalId: string;
  publication: Publication;
  title: string;
  description?: string | null;
  link?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  organizer?: string | null;
  organizerEmail?: string | null;
  website?: string | null;
  tags?: string | null;
  format?: string | null;
  courseNumber?: string | null;
  memberPrice?: string | null;
  nonmemberPrice?: string | null;
  imageUrl?: string | null;
  imageThumb?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface EventRow {
  id: number;
  title: string;
  description: string | null;
  link: string | null;
  publication: Publication;
  start_date: string | Date | null;
  end_date: string | Date | null;
  location: string | null;
  organizer: string | null;
  organizer_email: string | null;
  website: string | null;
  tags: string | null;
  format: string | null;
  course_number: string | null;
  member_price: string | null;
  nonmember_price: string | null;
  image_url: string | null;
  image_thumb: string | null;
  lat: number | string | null;
  lng: number | string | null;
}

function toIso(d: string | Date | null): string | null {
  if (d === null || d === undefined) return null;
  if (d instanceof Date) return d.toISOString();
  // Neon returns timestamptz as strings already
  return new Date(d).toISOString();
}

function toNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function rowToEvent(r: EventRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    link: r.link ?? '',
    publication: r.publication,
    startDate: toIso(r.start_date),
    endDate: toIso(r.end_date),
    location: r.location,
    organizer: r.organizer,
    organizerEmail: r.organizer_email,
    website: r.website,
    tags: r.tags,
    format: r.format,
    courseNumber: r.course_number,
    memberPrice: r.member_price,
    nonmemberPrice: r.nonmember_price,
    imageUrl: r.image_url,
    imageThumb: r.image_thumb,
    lat: toNumber(r.lat),
    lng: toNumber(r.lng),
  };
}

/** List upcoming events for a publication, ordered by start date ascending. */
export async function listEvents(publication: Publication): Promise<CalendarEvent[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
      FROM events
     WHERE publication = ${publication}
       AND (end_date IS NULL OR end_date >= NOW() - INTERVAL '1 day')
     ORDER BY (start_date IS NULL), start_date ASC, id ASC
  `) as unknown as EventRow[];
  return rows.map(rowToEvent);
}

/**
 * Insert or update a batch of events keyed by (external_source, external_id).
 * Sets last_synced_at to NOW() so callers can prune stale rows afterwards.
 */
export async function upsertEvents(
  events: EventInput[],
): Promise<{ inserted: number; updated: number }> {
  await ensureSchema();
  if (events.length === 0) return { inserted: 0, updated: 0 };

  const sql = getSql();
  let inserted = 0;
  let updated = 0;

  // Upserts run sequentially. For ~60 events that's fine on serverless.
  for (const ev of events) {
    const result = (await sql`
      INSERT INTO events (
        external_source, external_id, publication, title, description, link,
        start_date, end_date, location, organizer, organizer_email, website,
        tags, format, course_number, member_price, nonmember_price,
        image_url, image_thumb, lat, lng, last_synced_at, updated_at
      ) VALUES (
        ${ev.externalSource}, ${ev.externalId}, ${ev.publication}, ${ev.title},
        ${ev.description ?? null}, ${ev.link ?? null},
        ${ev.startDate ?? null}, ${ev.endDate ?? null},
        ${ev.location ?? null}, ${ev.organizer ?? null}, ${ev.organizerEmail ?? null},
        ${ev.website ?? null}, ${ev.tags ?? null}, ${ev.format ?? null},
        ${ev.courseNumber ?? null}, ${ev.memberPrice ?? null}, ${ev.nonmemberPrice ?? null},
        ${ev.imageUrl ?? null}, ${ev.imageThumb ?? null},
        ${ev.lat ?? null}, ${ev.lng ?? null},
        NOW(), NOW()
      )
      ON CONFLICT (external_source, external_id) DO UPDATE SET
        publication      = EXCLUDED.publication,
        title            = EXCLUDED.title,
        description      = EXCLUDED.description,
        link             = EXCLUDED.link,
        start_date       = EXCLUDED.start_date,
        end_date         = EXCLUDED.end_date,
        location         = EXCLUDED.location,
        organizer        = EXCLUDED.organizer,
        organizer_email  = EXCLUDED.organizer_email,
        website          = EXCLUDED.website,
        tags             = EXCLUDED.tags,
        format           = EXCLUDED.format,
        course_number    = EXCLUDED.course_number,
        member_price     = EXCLUDED.member_price,
        nonmember_price  = EXCLUDED.nonmember_price,
        image_url        = EXCLUDED.image_url,
        image_thumb      = EXCLUDED.image_thumb,
        lat              = EXCLUDED.lat,
        lng              = EXCLUDED.lng,
        last_synced_at   = NOW(),
        updated_at       = NOW()
      RETURNING (xmax = 0) AS inserted
    `) as unknown as { inserted: boolean }[];

    if (result[0]?.inserted) inserted += 1;
    else updated += 1;
  }

  return { inserted, updated };
}

/**
 * Delete future events from the given source whose last_synced_at is older
 * than the cutoff. This drops upstream cancellations the day after they
 * vanish from the source. Past events are left alone.
 */
export async function pruneStale(
  source: EventSource,
  olderThanMinutes: number,
): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const result = (await sql`
    DELETE FROM events
     WHERE external_source = ${source}
       AND last_synced_at < NOW() - (${String(olderThanMinutes)} || ' minutes')::INTERVAL
       AND (start_date IS NULL OR start_date >= NOW())
     RETURNING id
  `) as unknown as { id: number }[];
  return result.length;
}
