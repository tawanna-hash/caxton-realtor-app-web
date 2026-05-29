// caxton-events-v1
// Read/write API for the events table. The shape returned to the dashboard
// matches the `CalendarEvent` interface defined inline in the dashboard page,
// so no frontend type changes are needed.

import { ensureSchema, getSql } from './db';

export type Publication = 'austin' | 'san_antonio';
export type EventSource = 'unlockmls' | 'wordpress' | 'manual' | 'fpr' | 'hba' | 'sabor';

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
  instructor: string | null;
  instructorBio: string | null;
  lat: number | null;
  lng: number | null;
  // Sponsored support — populated from WP _event_sponsored, _event_sponsor_tier, _event_sponsor_advertiser.
  // Optional because columns may not exist on all rows; SELECT * passes them through when present.
  sponsored?: string;        // "1" or "" from WP
  sponsor_tier?: string;     // "standard" | "featured" | "hero"
  sponsor_advertiser?: string;
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
  instructorName?: string | null;
  instructorBio?: string | null;
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
  instructor_name: string | null;
  instructor_bio: string | null;
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
    instructor: r.instructor_name,
    instructorBio: r.instructor_bio,
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
       AND hidden = false
       AND (end_date IS NULL OR end_date >= NOW() - INTERVAL '1 day')
     ORDER BY (start_date IS NULL), start_date ASC, id ASC
  `) as unknown as EventRow[];
  return rows.map(rowToEvent);
}

/**
 * Look up a single event by id within a publication.
 * Returns null if the event doesn't exist, is hidden, or belongs to a
 * different publication. Past events ARE returned (shareable URLs may
 * outlive the event date).
 */
export async function getEventById(
  publication: Publication,
  id: number,
): Promise<CalendarEvent | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
      FROM events
     WHERE id = ${id}
       AND publication = ${publication}
       AND hidden = false
     LIMIT 1
  `) as unknown as EventRow[];
  if (rows.length === 0) return null;
  return rowToEvent(rows[0]);
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
        image_url, image_thumb, instructor_name, instructor_bio, lat, lng,
        last_synced_at, updated_at
      ) VALUES (
        ${ev.externalSource}, ${ev.externalId}, ${ev.publication}, ${ev.title},
        ${ev.description ?? null}, ${ev.link ?? null},
        ${ev.startDate ?? null}, ${ev.endDate ?? null},
        ${ev.location ?? null}, ${ev.organizer ?? null}, ${ev.organizerEmail ?? null},
        ${ev.website ?? null}, ${ev.tags ?? null}, ${ev.format ?? null},
        ${ev.courseNumber ?? null}, ${ev.memberPrice ?? null}, ${ev.nonmemberPrice ?? null},
        ${ev.imageUrl ?? null}, ${ev.imageThumb ?? null},
        ${ev.instructorName ?? null}, ${ev.instructorBio ?? null},
        ${ev.lat ?? null}, ${ev.lng ?? null},
        NOW(), NOW()
      )
      ON CONFLICT (external_source, external_id) DO UPDATE SET
        -- Per-field merge: admin-edited columns survive scraper re-runs.
        -- Each column reads the existing row's edited_fields array; if the
        -- column name is in there, we keep events.<col>, otherwise we take
        -- the new EXCLUDED.<col>. See DECISIONS.md #5.
        publication      = CASE WHEN 'publication'      = ANY(events.edited_fields) THEN events.publication      ELSE EXCLUDED.publication      END,
        title            = CASE WHEN 'title'            = ANY(events.edited_fields) THEN events.title            ELSE EXCLUDED.title            END,
        description      = CASE WHEN 'description'      = ANY(events.edited_fields) THEN events.description      ELSE EXCLUDED.description      END,
        link             = CASE WHEN 'link'             = ANY(events.edited_fields) THEN events.link             ELSE EXCLUDED.link             END,
        start_date       = CASE WHEN 'start_date'       = ANY(events.edited_fields) THEN events.start_date       ELSE EXCLUDED.start_date       END,
        end_date         = CASE WHEN 'end_date'         = ANY(events.edited_fields) THEN events.end_date         ELSE EXCLUDED.end_date         END,
        location         = CASE WHEN 'location'         = ANY(events.edited_fields) THEN events.location         ELSE EXCLUDED.location         END,
        organizer        = CASE WHEN 'organizer'        = ANY(events.edited_fields) THEN events.organizer        ELSE EXCLUDED.organizer        END,
        organizer_email  = CASE WHEN 'organizer_email'  = ANY(events.edited_fields) THEN events.organizer_email  ELSE EXCLUDED.organizer_email  END,
        website          = CASE WHEN 'website'          = ANY(events.edited_fields) THEN events.website          ELSE EXCLUDED.website          END,
        tags             = CASE WHEN 'tags'             = ANY(events.edited_fields) THEN events.tags             ELSE EXCLUDED.tags             END,
        format           = CASE WHEN 'format'           = ANY(events.edited_fields) THEN events.format           ELSE EXCLUDED.format           END,
        course_number    = CASE WHEN 'course_number'    = ANY(events.edited_fields) THEN events.course_number    ELSE EXCLUDED.course_number    END,
        member_price     = CASE WHEN 'member_price'     = ANY(events.edited_fields) THEN events.member_price     ELSE EXCLUDED.member_price     END,
        nonmember_price  = CASE WHEN 'nonmember_price'  = ANY(events.edited_fields) THEN events.nonmember_price  ELSE EXCLUDED.nonmember_price  END,
        image_url        = CASE WHEN 'image_url'        = ANY(events.edited_fields) THEN events.image_url        ELSE EXCLUDED.image_url        END,
        image_thumb      = CASE WHEN 'image_thumb'      = ANY(events.edited_fields) THEN events.image_thumb      ELSE EXCLUDED.image_thumb      END,
        instructor_name  = CASE WHEN 'instructor_name'  = ANY(events.edited_fields) THEN events.instructor_name  ELSE EXCLUDED.instructor_name  END,
        instructor_bio   = CASE WHEN 'instructor_bio'   = ANY(events.edited_fields) THEN events.instructor_bio   ELSE EXCLUDED.instructor_bio   END,
        lat              = CASE WHEN 'lat'              = ANY(events.edited_fields) THEN events.lat              ELSE EXCLUDED.lat              END,
        lng              = CASE WHEN 'lng'              = ANY(events.edited_fields) THEN events.lng              ELSE EXCLUDED.lng              END,
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

// ============================================================
// Admin API — manual events dashboard (DECISIONS.md #5).
// These functions are NOT used by the public dashboard. They power
// the /admin/events route. Public listEvents() above filters out
// hidden rows; this admin layer sees everything.
// ============================================================

/** Admin-facing event shape. Includes provenance + edit metadata. */
export interface AdminCalendarEvent extends CalendarEvent {
  externalSource: EventSource;
  externalId: string;
  hidden: boolean;
  editedFields: string[];
  editedBy: string | null;
  editedAt: string | null;
}

interface AdminEventRow extends EventRow {
  external_source: EventSource;
  external_id: string;
  hidden: boolean;
  edited_fields: string[];
  edited_by: string | null;
  edited_at: string | Date | null;
}

function rowToAdminEvent(r: AdminEventRow): AdminCalendarEvent {
  return {
    ...rowToEvent(r),
    externalSource: r.external_source,
    externalId: r.external_id,
    hidden: r.hidden,
    editedFields: r.edited_fields ?? [],
    editedBy: r.edited_by,
    editedAt: toIso(r.edited_at),
  };
}

/**
 * Admin: list ALL events (including hidden, including past) for one or both
 * publications. Sorted newest-first by start date so admins see what's
 * currently live at the top.
 */
export async function listAllEventsForAdmin(
  publication?: Publication,
): Promise<AdminCalendarEvent[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = publication
    ? ((await sql`
        SELECT *
          FROM events
         WHERE publication = ${publication}
         ORDER BY (start_date IS NULL), start_date DESC, id DESC
      `) as unknown as AdminEventRow[])
    : ((await sql`
        SELECT *
          FROM events
         ORDER BY (start_date IS NULL), start_date DESC, id DESC
      `) as unknown as AdminEventRow[]);
  return rows.map(rowToAdminEvent);
}

/**
 * Admin: create a manual event. Generates a UUID for external_id and
 * stamps external_source='manual'. The createdBy email lands in edited_by
 * so we have an audit trail of who created what.
 */
export async function createManualEvent(
  input: Omit<EventInput, 'externalSource' | 'externalId'>,
  createdBy: string,
): Promise<AdminCalendarEvent> {
  await ensureSchema();
  const sql = getSql();
  const externalId = crypto.randomUUID();

  const rows = (await sql`
    INSERT INTO events (
      external_source, external_id, publication, title, description, link,
      start_date, end_date, location, organizer, organizer_email, website,
      tags, format, course_number, member_price, nonmember_price,
      image_url, image_thumb, instructor_name, instructor_bio, lat, lng,
      edited_by, edited_at, last_synced_at, updated_at
    ) VALUES (
      'manual', ${externalId}, ${input.publication}, ${input.title},
      ${input.description ?? null}, ${input.link ?? null},
      ${input.startDate ?? null}, ${input.endDate ?? null},
      ${input.location ?? null}, ${input.organizer ?? null}, ${input.organizerEmail ?? null},
      ${input.website ?? null}, ${input.tags ?? null}, ${input.format ?? null},
      ${input.courseNumber ?? null}, ${input.memberPrice ?? null}, ${input.nonmemberPrice ?? null},
      ${input.imageUrl ?? null}, ${input.imageThumb ?? null},
      ${input.instructorName ?? null}, ${input.instructorBio ?? null},
      ${input.lat ?? null}, ${input.lng ?? null},
      ${createdBy}, NOW(), NOW(), NOW()
    )
    RETURNING *
  `) as unknown as AdminEventRow[];

  return rowToAdminEvent(rows[0]);
}

/**
 * Admin: partial update of an event. Any field passed in `fields` is
 * written; any field omitted is left as-is. The set of column names being
 * updated gets unioned (deduped) into edited_fields, so on the next scraper
 * upsert the per-field merge will preserve these values.
 *
 * Implementation note: building dynamic SET clauses with the Neon tagged-
 * template client is awkward. Instead we read the row, merge in JS, and do
 * a single full UPDATE. Two queries per edit — fine for admin volume.
 */
export async function updateEvent(
  id: number,
  fields: Partial<Omit<EventInput, 'externalSource' | 'externalId'>>,
  editedBy: string,
): Promise<AdminCalendarEvent | null> {
  await ensureSchema();
  const sql = getSql();

  const existingRows = (await sql`
    SELECT * FROM events WHERE id = ${id}
  `) as unknown as AdminEventRow[];
  if (existingRows.length === 0) return null;
  const existing = existingRows[0];

  // Map EventInput keys → DB column names.
  const colMap: Record<string, string> = {
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

  // Compute which columns are actually being changed (key exists AND value
  // differs from existing). No-op fields don't get added to edited_fields.
  const newEditedFields = new Set(existing.edited_fields ?? []);
  const merged: Record<string, unknown> = {};
  for (const [key, dbCol] of Object.entries(colMap)) {
    if (key in fields) {
      const incoming = (fields as Record<string, unknown>)[key];
      const current = (existing as unknown as Record<string, unknown>)[dbCol];
      merged[dbCol] = incoming ?? null;
      if (incoming !== current) {
        newEditedFields.add(dbCol);
      }
    } else {
      merged[dbCol] = (existing as unknown as Record<string, unknown>)[dbCol];
    }
  }

  const editedFieldsArr = Array.from(newEditedFields);

  const rows = (await sql`
    UPDATE events SET
      publication      = ${merged.publication as string},
      title            = ${merged.title as string},
      description      = ${(merged.description as string | null) ?? null},
      link             = ${(merged.link as string | null) ?? null},
      start_date       = ${(merged.start_date as string | null) ?? null},
      end_date         = ${(merged.end_date as string | null) ?? null},
      location         = ${(merged.location as string | null) ?? null},
      organizer        = ${(merged.organizer as string | null) ?? null},
      organizer_email  = ${(merged.organizer_email as string | null) ?? null},
      website          = ${(merged.website as string | null) ?? null},
      tags             = ${(merged.tags as string | null) ?? null},
      format           = ${(merged.format as string | null) ?? null},
      course_number    = ${(merged.course_number as string | null) ?? null},
      member_price     = ${(merged.member_price as string | null) ?? null},
      nonmember_price  = ${(merged.nonmember_price as string | null) ?? null},
      image_url        = ${(merged.image_url as string | null) ?? null},
      image_thumb      = ${(merged.image_thumb as string | null) ?? null},
      instructor_name  = ${(merged.instructor_name as string | null) ?? null},
      instructor_bio   = ${(merged.instructor_bio as string | null) ?? null},
      lat              = ${(merged.lat as number | null) ?? null},
      lng              = ${(merged.lng as number | null) ?? null},
      edited_fields    = ${editedFieldsArr},
      edited_by        = ${editedBy},
      edited_at        = NOW(),
      updated_at       = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown as AdminEventRow[];

  return rows.length > 0 ? rowToAdminEvent(rows[0]) : null;
}

/**
 * Admin: hide or unhide an event. Hide is the right operation for scraped
 * events because the next scraper run would just recreate a deleted row.
 * Doesn't touch edited_fields — hidden is metadata, not content.
 */
export async function setHidden(
  id: number,
  hidden: boolean,
  editedBy: string,
): Promise<AdminCalendarEvent | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE events SET
      hidden     = ${hidden},
      edited_by  = ${editedBy},
      edited_at  = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown as AdminEventRow[];

  return rows.length > 0 ? rowToAdminEvent(rows[0]) : null;
}

/**
 * Admin: hard-delete a manual event. Refuses to delete scraped events
 * (use setHidden(id, true) instead — scrapers would just recreate a delete).
 * Returns false if the event doesn't exist or isn't manual.
 */
export async function deleteEvent(id: number): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM events
     WHERE id = ${id}
       AND external_source = 'manual'
     RETURNING id
  `) as unknown as { id: number }[];
  return rows.length > 0;
}
