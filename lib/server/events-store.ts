/**
 * Admin events store — manual events CRUD against the Neon `events` table.
 *
 * Uses the existing Neon connection via `lib/server/db/neon.ts` (pg Pool).
 *
 * Naming note: the JSON read serializer uses `instructorName` (matching the
 * write payload). This corrects the original API which read it back as
 * `instructor` and wrote it as `instructorName` — three names for one column.
 */

import crypto from 'node:crypto';
import { ApiError } from './error';
import { query } from './db/neon';
import { geocodeAddress } from '@/lib/geocode';
import { logger } from './logger';

/**
 * Best-effort geocode of a free-form venue/location string. Returns null
 * on any failure (network, no match, malformed) so the caller can still
 * insert the event row without lat/lng. Never throws.
 */
async function geocodeEventLocation(
  location: string | null | undefined,
): Promise<{ lat: number; lng: number } | null> {
  const oneline = (location ?? '').trim();
  if (!oneline) return null;
  try {
    const res = await geocodeAddress({ address: oneline });
    if (res.ok && typeof res.lat === 'number' && typeof res.lon === 'number') {
      return { lat: res.lat, lng: res.lon };
    }
    return null;
  } catch (err) {
    logger.warn(
      { location: oneline, err: err instanceof Error ? err.message : String(err) },
      '[events-store] geocode failed',
    );
    return null;
  }
}

export type Publication = 'austin' | 'san_antonio';
export type EventSource =
  | 'unlockmls'
  | 'wordpress'
  | 'manual'
  | 'fpr'
  | 'hba'
  | 'submission'    // Advertiser self-submission via /submit-event/[token]
  | 'facebook-llm'  // Gemini-detected event from RealtyLine FB Page post
  | 'facebook-graph'; // Native Facebook Page event pulled via Graph API

export interface AdminCalendarEvent {
  id: number;
  externalSource: EventSource;
  externalId: string;
  publication: Publication;
  title: string;
  description: string;
  link: string;
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
  instructorName: string | null;
  instructorBio: string | null;
  lat: number | null;
  lng: number | null;
  hidden: boolean;
  editedFields: string[];
  editedBy: string | null;
  editedAt: string | null;
}

export interface ManualEventInput {
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
  instructorName?: string | null;
  instructorBio?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface EventRow {
  id: number;
  external_source: EventSource;
  external_id: string;
  publication: Publication;
  title: string;
  description: string | null;
  link: string | null;
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
  instructor_name: string | null;
  instructor_bio: string | null;
  lat: number | string | null;
  lng: number | string | null;
  hidden: boolean;
  edited_fields: string[] | null;
  edited_by: string | null;
  edited_at: string | Date | null;
}

function toIso(d: string | Date | null): string | null {
  if (d === null || d === undefined) return null;
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

function toNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function rowToAdminEvent(r: EventRow): AdminCalendarEvent {
  return {
    id: r.id,
    externalSource: r.external_source,
    externalId: r.external_id,
    publication: r.publication,
    title: r.title,
    description: r.description ?? '',
    link: r.link ?? '',
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
    instructorName: r.instructor_name,
    instructorBio: r.instructor_bio,
    lat: toNumber(r.lat),
    lng: toNumber(r.lng),
    hidden: r.hidden,
    editedFields: r.edited_fields ?? [],
    editedBy: r.edited_by,
    editedAt: toIso(r.edited_at),
  };
}

const SELECT_COLS = `
  id, external_source, external_id, publication, title, description, link,
  start_date, end_date, location, organizer, organizer_email, website,
  tags, format, course_number, member_price, nonmember_price,
  image_url, image_thumb, instructor_name, instructor_bio, lat, lng,
  hidden, edited_fields, edited_by, edited_at
`;

/** Admin: list ALL events (incl. hidden + past) for one or both publications. */
export async function listAllEventsForAdmin(
  publication?: Publication,
): Promise<AdminCalendarEvent[]> {
  const sql = publication
    ? `SELECT ${SELECT_COLS} FROM events
        WHERE publication = $1
        ORDER BY (start_date IS NULL), start_date DESC, id DESC`
    : `SELECT ${SELECT_COLS} FROM events
        ORDER BY (start_date IS NULL), start_date DESC, id DESC`;
  const params = publication ? [publication] : [];
  return (await query<EventRow>(sql, params)).map(rowToAdminEvent);
}

/** Admin: fetch one event by id. */
export async function getEventById(id: number): Promise<AdminCalendarEvent | null> {
  const rows = await query<EventRow>(
    `SELECT ${SELECT_COLS} FROM events WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToAdminEvent(rows[0]) : null;
}

/** Admin: create a manual event. */
export async function createManualEvent(
  input: ManualEventInput,
  createdBy: string,
): Promise<AdminCalendarEvent> {
  const externalId = crypto.randomUUID();
  const rows = await query<EventRow>(
    `INSERT INTO events (
       external_source, external_id, publication, title, description, link,
       start_date, end_date, location, organizer, organizer_email, website,
       tags, format, course_number, member_price, nonmember_price,
       image_url, image_thumb, instructor_name, instructor_bio, lat, lng,
       edited_by, edited_at, last_synced_at, updated_at
     ) VALUES (
       'manual', $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22,
       $23, NOW(), NOW(), NOW()
     )
     RETURNING ${SELECT_COLS}`,
    [
      externalId,
      input.publication,
      input.title,
      input.description ?? null,
      input.link ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      input.location ?? null,
      input.organizer ?? null,
      input.organizerEmail ?? null,
      input.website ?? null,
      input.tags ?? null,
      input.format ?? null,
      input.courseNumber ?? null,
      input.memberPrice ?? null,
      input.nonmemberPrice ?? null,
      input.imageUrl ?? null,
      input.imageThumb ?? null,
      input.instructorName ?? null,
      input.instructorBio ?? null,
      input.lat ?? null,
      input.lng ?? null,
      createdBy,
    ],
  );
  if (!rows[0]) throw new ApiError(500, 'Event INSERT returned no row');
  return rowToAdminEvent(rows[0]);
}

/**
 * Insert a pending event from an advertiser self-submission (Path A).
 *
 * Always lands with hidden=true so it sits in the admin review queue
 * until approved. external_source='submission' lets the queue UI filter
 * to just submitted/Gemini rows.
 */
export async function createSubmittedEvent(input: {
  publication: Publication;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  location: string | null;
  website: string | null;
  link: string | null;
  imageUrl: string | null;
  organizer: string;
  advertiserId: number;
}): Promise<AdminCalendarEvent> {
  const externalId = crypto.randomUUID();
  const coords = await geocodeEventLocation(input.location);
  const rows = await query<EventRow>(
    `INSERT INTO events (
       external_source, external_id, publication, title, description, link,
       start_date, end_date, location, organizer, website, image_url,
       submitted_by_advertiser_id, lat, lng, hidden,
       last_synced_at, updated_at
     ) VALUES (
       'submission', $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10, $11,
       $12, $13, $14, true,
       NOW(), NOW()
     )
     RETURNING ${SELECT_COLS}`,
    [
      externalId,
      input.publication,
      input.title,
      input.description,
      input.link,
      input.startDate,
      input.endDate,
      input.location,
      input.organizer,
      input.website,
      input.imageUrl,
      input.advertiserId,
      coords?.lat ?? null,
      coords?.lng ?? null,
    ],
  );
  if (!rows[0]) throw new ApiError(500, 'Submitted event INSERT returned no row');
  return rowToAdminEvent(rows[0]);
}

/**
 * Insert a pending event detected by Gemini from a Facebook Page post (Path D).
 *
 * source_post_id is unique-indexed so re-running the scanner cron on the
 * same post idempotently no-ops (no duplicate detection rows).
 *
 * Returns null when this post has already been scanned (caller treats as
 * "nothing to do, move on").
 */
export async function createLLMDetectedEvent(input: {
  publication: Publication;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  link: string | null;
  imageUrl: string | null;
  organizer: string | null;
  confidence: number;
  sourcePostId: number;
}): Promise<AdminCalendarEvent | null> {
  const externalId = `fb-llm-${input.sourcePostId}`;
  const coords = await geocodeEventLocation(input.location);
  // ON CONFLICT on source_post_id idempotency: re-scanning the same FB post
  // returns 0 rows so the cron knows to skip. The unique partial index on
  // events(source_post_id) WHERE source_post_id IS NOT NULL enforces this.
  const rows = await query<EventRow>(
    `INSERT INTO events (
       external_source, external_id, publication, title, description, link,
       start_date, end_date, location, organizer, image_url,
       source_post_id, confidence, lat, lng, hidden,
       last_synced_at, updated_at
     ) VALUES (
       'facebook-llm', $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14, true,
       NOW(), NOW()
     )
     ON CONFLICT ON CONSTRAINT events_external_uniq DO NOTHING
     RETURNING ${SELECT_COLS}`,
    [
      externalId,
      input.publication,
      input.title,
      input.description,
      input.link,
      input.startDate,
      input.endDate,
      input.location,
      input.organizer,
      input.imageUrl,
      input.sourcePostId,
      input.confidence,
      coords?.lat ?? null,
      coords?.lng ?? null,
    ],
  );
  return rows[0] ? rowToAdminEvent(rows[0]) : null;
}

/**
 * Insert a pending event pulled from the Facebook Graph API /{page-id}/events
 * endpoint (Path E). Fallback to Gemini-on-posts detection: this catches
 * events admins published natively through Facebook's event tool, which often
 * don't have a corresponding wall post for Gemini to read.
 *
 * external_id is `fb-graph-<facebookEventId>` so the events_external_uniq
 * constraint makes re-running idempotent. (We don't use source_post_id here
 * because there is no featured_social_posts row — this is a Page-level
 * event, not a post-level detection.)
 *
 * Returns null when the event was already inserted on a prior cron run.
 */
export async function createGraphDetectedEvent(input: {
  publication: Publication;
  facebookEventId: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  link: string;
  imageUrl: string | null;
}): Promise<AdminCalendarEvent | null> {
  const externalId = `fb-graph-${input.facebookEventId}`;
  const coords = await geocodeEventLocation(input.location);
  const rows = await query<EventRow>(
    `INSERT INTO events (
       external_source, external_id, publication, title, description, link,
       start_date, end_date, location, image_url,
       lat, lng, hidden,
       last_synced_at, updated_at
     ) VALUES (
       'facebook-graph', $1, $2, $3, $4, $5,
       $6, $7, $8, $9,
       $10, $11, true,
       NOW(), NOW()
     )
     ON CONFLICT ON CONSTRAINT events_external_uniq DO NOTHING
     RETURNING ${SELECT_COLS}`,
    [
      externalId,
      input.publication,
      input.title,
      input.description,
      input.link,
      input.startDate,
      input.endDate,
      input.location,
      input.imageUrl,
      coords?.lat ?? null,
      coords?.lng ?? null,
    ],
  );
  return rows[0] ? rowToAdminEvent(rows[0]) : null;
}

/**
 * Admin queue: events awaiting review. Either source='submission' (advertiser
 * self-submitted via public form) or source='facebook-llm' (Gemini extracted
 * from a FB Page post). Manual hidden events authored by admins themselves
 * are excluded — they used the "Hide" toggle deliberately.
 */
export async function listPendingEvents(): Promise<AdminCalendarEvent[]> {
  const rows = await query<EventRow>(
    `SELECT ${SELECT_COLS} FROM events
      WHERE hidden = true
        AND external_source IN ('submission', 'facebook-llm', 'facebook-graph')
      ORDER BY created_at DESC`,
  );
  return rows.map(rowToAdminEvent);
}

/** Admin queue: count of pending events for nav badge. */
export async function countPendingEvents(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events
      WHERE hidden = true
        AND external_source IN ('submission', 'facebook-llm', 'facebook-graph')`,
  );
  return rows[0] ? parseInt(rows[0].count, 10) : 0;
}

/** Admin: approve a pending event (hidden=false; it appears on the calendar). */
export async function approvePendingEvent(
  id: number,
  editedBy: string,
): Promise<AdminCalendarEvent | null> {
  const rows = await query<EventRow>(
    `UPDATE events SET hidden = false, edited_by = $1, edited_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND hidden = true
        AND external_source IN ('submission', 'facebook-llm', 'facebook-graph')
      RETURNING ${SELECT_COLS}`,
    [editedBy, id],
  );
  return rows[0] ? rowToAdminEvent(rows[0]) : null;
}

/** Admin: partial update. Returns null if not found. */
export async function updateEvent(
  id: number,
  fields: Partial<ManualEventInput>,
  editedBy: string,
): Promise<AdminCalendarEvent | null> {
  const colMap: Record<keyof ManualEventInput, string> = {
    publication: 'publication',
    title: 'title',
    description: 'description',
    link: 'link',
    startDate: 'start_date',
    endDate: 'end_date',
    location: 'location',
    organizer: 'organizer',
    organizerEmail: 'organizer_email',
    website: 'website',
    tags: 'tags',
    format: 'format',
    courseNumber: 'course_number',
    memberPrice: 'member_price',
    nonmemberPrice: 'nonmember_price',
    imageUrl: 'image_url',
    imageThumb: 'image_thumb',
    instructorName: 'instructor_name',
    instructorBio: 'instructor_bio',
    lat: 'lat',
    lng: 'lng',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  const newlyEditedCols: string[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) {
      const v = (fields as Record<string, unknown>)[key];
      setClauses.push(`${col} = $${i++}`);
      values.push(v ?? null);
      newlyEditedCols.push(col);
    }
  }

  if (setClauses.length === 0) {
    throw new ApiError(400, 'No fields to update');
  }

  setClauses.push(
    `edited_fields = ARRAY(SELECT DISTINCT unnest(events.edited_fields || $${i++}::text[]))`,
  );
  values.push(newlyEditedCols);

  setClauses.push(`edited_by = $${i++}`);
  values.push(editedBy);

  setClauses.push(`edited_at = NOW()`);
  setClauses.push(`updated_at = NOW()`);

  values.push(id);

  const rows = await query<EventRow>(
    `UPDATE events SET ${setClauses.join(', ')}
       WHERE id = $${i}
   RETURNING ${SELECT_COLS}`,
    values,
  );

  return rows[0] ? rowToAdminEvent(rows[0]) : null;
}

/** Admin: hide / unhide. Returns null if not found. */
export async function setHidden(
  id: number,
  hidden: boolean,
  editedBy: string,
): Promise<AdminCalendarEvent | null> {
  const rows = await query<EventRow>(
    `UPDATE events SET
       hidden = $1,
       edited_by = $2,
       edited_at = NOW(),
       updated_at = NOW()
     WHERE id = $3
     RETURNING ${SELECT_COLS}`,
    [hidden, editedBy, id],
  );
  return rows[0] ? rowToAdminEvent(rows[0]) : null;
}

/** Admin: bulk-hide every event whose start_date is in the past and not yet hidden. */
export async function hideExpired(editedBy: string): Promise<number> {
  const result = await query<{ id: number }>(
    `UPDATE events SET
       hidden = TRUE,
       edited_by = $1,
       edited_at = NOW(),
       updated_at = NOW()
     WHERE hidden = FALSE
       AND start_date IS NOT NULL
       AND start_date < NOW()
     RETURNING id`,
    [editedBy],
  );
  return result.length;
}

/** Admin: hard-delete a manual event only. Returns true if a row was deleted. */
export async function deleteEvent(id: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    `DELETE FROM events
       WHERE id = $1
         AND external_source = 'manual'
     RETURNING id`,
    [id],
  );
  return result.length > 0;
}
