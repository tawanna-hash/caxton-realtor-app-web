// lib/event-photos.ts
//
// Event photo storage — Neon-backed. Powers the public /event-images
// gallery and the admin upload/manage surface.
//
// Schema:
//   event_photos (
//     id            SERIAL PK,
//     title         TEXT NOT NULL,
//     event_date    DATE NOT NULL,         -- issue month (stored as YYYY-MM-01)
//     image_url     TEXT NOT NULL,          -- full-size image URL
//     thumbnail_url TEXT,                   -- optional separate thumbnail
//     description   TEXT,
//     publication    TEXT NOT NULL DEFAULT 'realtyline',
//     uploaded_by    TEXT,
//     advertiser_id  INTEGER REFERENCES advertisers(id) ON DELETE SET NULL,
//     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   )

import { getSql } from '@/lib/db';

export type EventPhoto = {
  id: number;
  title: string;
  eventDate: string;       // ISO date (YYYY-MM-01, represents issue month)
  imageUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  publication: string;
  uploadedBy: string | null;
  advertiserId: number | null;
  createdAt: string;
};

export type EventPhotoMonth = {
  monthKey: string;         // "2025-12"
  monthLabel: string;       // "December 2025"
  photos: EventPhoto[];
};

// The advertiser association is optional, and callers hand it over in whatever
// shape their transport produced: the admin form posts '' for "no advertiser",
// FormData yields strings, JSON clients send null. Anything that isn't a
// positive integer means "unassociated".
export function normalizeAdvertiserId(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

let schemaReady = false;

export async function ensureEventPhotosSchema() {
  if (schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS event_photos (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      event_date    DATE NOT NULL,
      image_url     TEXT NOT NULL,
      thumbnail_url TEXT,
      description   TEXT,
      publication   TEXT NOT NULL DEFAULT 'realtyline',
      uploaded_by   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    ALTER TABLE event_photos
    ADD COLUMN IF NOT EXISTS advertiser_id INT REFERENCES advertisers(id) ON DELETE SET NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_photos_date ON event_photos (event_date DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_photos_pub ON event_photos (publication)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_photos_advertiser ON event_photos (advertiser_id)`;
  schemaReady = true;
}

// Shape of an event_photos row as returned by Neon.
// DATE / TIMESTAMPTZ come back as JS Date objects; nullable columns
// are typed as `| null` because Neon preserves SQL NULL faithfully.
interface EventPhotoRow {
  id: number;
  title: string;
  event_date: Date | string;
  image_url: string;
  thumbnail_url: string | null;
  description: string | null;
  publication: string;
  uploaded_by: string | null;
  advertiser_id: number | null;
  created_at: Date | string;
}

function rowToPhoto(r: EventPhotoRow): EventPhoto {
  // Neon returns DATE columns as JS Date objects, not strings.
  // Convert to string to avoid timezone issues and ensure .slice() works.
  const eventDateStr = r.event_date instanceof Date
    ? r.event_date.toISOString().slice(0, 10)
    : String(r.event_date);
  const createdAtStr = r.created_at instanceof Date
    ? r.created_at.toISOString()
    : String(r.created_at);
  return {
    id: r.id,
    title: r.title,
    eventDate: eventDateStr,
    imageUrl: r.image_url,
    thumbnailUrl: r.thumbnail_url ?? null,
    description: r.description ?? null,
    publication: r.publication,
    uploadedBy: r.uploaded_by ?? null,
    advertiserId: r.advertiser_id ?? null,
    createdAt: createdAtStr,
  };
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export async function listEventPhotos(opts: {
  publication?: string;
  advertiserId?: number | null;
  limit?: number;
}): Promise<EventPhoto[]> {
  await ensureEventPhotosSchema();
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 500, 2000);
  const pub = opts.publication ?? null;
  const advertiserId = opts.advertiserId ?? null;

  // Null-tolerant predicates keep this to one query — Neon's tagged template
  // can't interpolate a dynamically built WHERE clause.
  const rows = await sql`
    SELECT * FROM event_photos
    WHERE (${pub}::text IS NULL OR publication = ${pub}::text)
      AND (${advertiserId}::int IS NULL OR advertiser_id = ${advertiserId}::int)
    ORDER BY event_date DESC, created_at DESC
    LIMIT ${limit}
  `;
  return (rows as EventPhotoRow[]).map(rowToPhoto);
}

export async function listEventPhotosGrouped(opts: {
  publication?: string;
  advertiserId?: number | null;
}): Promise<EventPhotoMonth[]> {
  const photos = await listEventPhotos(opts);
  return groupByMonth(photos);
}

export async function listEventPhotosByAdvertiser(
  advertiserId: number,
  advertiserName?: string,
): Promise<EventPhotoMonth[]> {
  // Primary: photos explicitly tagged with this advertiser_id.
  // Fallback: photos whose title contains the advertiser's name (case-insensitive),
  // so existing photos uploaded before the advertiser_id column was added still
  // surface on the advertiser's public page without manual re-tagging.
  const photos = await listEventPhotos({ advertiserId });

  if (advertiserName) {
    await ensureEventPhotosSchema();
    const sql = getSql();
    const namePattern = `%${advertiserName.replace(/[%_]/g, '\\$&')}%`;
    const titleMatched = await sql`
      SELECT * FROM event_photos
      WHERE title ILIKE ${namePattern}
        AND (advertiser_id IS NULL OR advertiser_id != ${advertiserId})
      ORDER BY event_date DESC, created_at DESC
      LIMIT 500
    `;
    const mapped = (titleMatched as EventPhotoRow[]).map(rowToPhoto);
    // Dedupe by photo id — a photo might match both the explicit tag and the
    // title pattern. Keep the explicitly-tagged version.
    const seen = new Set(photos.map((p) => p.id));
    for (const p of mapped) {
      if (!seen.has(p.id)) {
        photos.push(p);
        seen.add(p.id);
      }
    }
    // Re-sort by date since we merged two result sets.
    photos.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }

  return groupByMonth(photos);
}

function groupByMonth(photos: EventPhoto[]): EventPhotoMonth[] {
  const byMonth = new Map<string, EventPhoto[]>();

  for (const p of photos) {
    // Extract YYYY-MM directly from the string to avoid timezone conversion.
    // Neon returns DATE as ISO like "2026-07-01T00:00:00.000Z".
    // new Date() applies local TZ, causing off-by-one month errors.
    const monthKey = p.eventDate.slice(0, 7); // "2026-07"
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey)!.push(p);
  }

  const months: EventPhotoMonth[] = [];
  for (const [monthKey, photos] of byMonth) {
    const [year, mon] = monthKey.split('-').map(Number);
    months.push({
      monthKey,
      monthLabel: `${MONTH_LABELS[mon - 1]} ${year}`,
      photos,
    });
  }

  return months.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export async function createEventPhoto(input: {
  title: string;
  eventDate: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  publication?: string;
  uploadedBy?: string | null;
  advertiserId?: number | null;
}): Promise<EventPhoto> {
  await ensureEventPhotosSchema();
  const sql = getSql();
  const pub = input.publication ?? 'realtyline';

  const rows = await sql`
    INSERT INTO event_photos (title, event_date, image_url, thumbnail_url, description, publication, uploaded_by, advertiser_id)
    VALUES (${input.title}, ${input.eventDate}, ${input.imageUrl},
            ${input.thumbnailUrl ?? null}, ${input.description ?? null},
            ${pub}, ${input.uploadedBy ?? null}, ${input.advertiserId ?? null})
    RETURNING *
  `;
  return rowToPhoto(rows[0] as EventPhotoRow);
}

export async function deleteEventPhoto(id: number): Promise<boolean> {
  await ensureEventPhotosSchema();
  const sql = getSql();
  const rows = await sql`
    DELETE FROM event_photos WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteEventPhotos(ids: number[]): Promise<number> {
  await ensureEventPhotosSchema();
  const sql = getSql();
  let deleted = 0;
  for (const id of ids) {
    const rows = await sql`DELETE FROM event_photos WHERE id = ${id} RETURNING id`;
    if (rows.length > 0) deleted++;
  }
  return deleted;
}

export async function deleteEventPhotosByMonth(monthKey: string): Promise<number> {
  await ensureEventPhotosSchema();
  const sql = getSql();
  const rows = await sql`
    DELETE FROM event_photos WHERE TO_CHAR(event_date, 'YYYY-MM') = ${monthKey} RETURNING id
  `;
  return rows.length;
}

export async function updateEventPhoto(id: number, fields: {
  title?: string;
  eventDate?: string;
  description?: string | null;
  publication?: string;
  advertiserId?: number | null;
}): Promise<EventPhoto | null> {
  await ensureEventPhotosSchema();
  const sql = getSql();

  const setTitle = fields.title !== undefined;
  const setDate = fields.eventDate !== undefined;
  const setDesc = fields.description !== undefined;
  const setPub = fields.publication !== undefined;
  const setAdvertiser = fields.advertiserId !== undefined;
  if (!setTitle && !setDate && !setDesc && !setPub && !setAdvertiser) return null;

  // Neon's tagged template can't interpolate a dynamically built SET clause, so
  // every column is assigned unconditionally and a per-field flag decides
  // whether the new value or the existing one wins. A flag is needed rather
  // than COALESCE because `description` and `advertiser_id` can be cleared to
  // NULL deliberately, which COALESCE would read as "not provided".
  const rows = await sql`
    UPDATE event_photos SET
      title         = CASE WHEN ${setTitle}::boolean THEN ${fields.title ?? null}::text ELSE title END,
      event_date    = CASE WHEN ${setDate}::boolean THEN ${fields.eventDate ?? null}::date ELSE event_date END,
      description   = CASE WHEN ${setDesc}::boolean THEN ${fields.description ?? null}::text ELSE description END,
      publication   = CASE WHEN ${setPub}::boolean THEN ${fields.publication ?? null}::text ELSE publication END,
      advertiser_id = CASE WHEN ${setAdvertiser}::boolean THEN ${fields.advertiserId ?? null}::int ELSE advertiser_id END
    WHERE id = ${id}
    RETURNING *
  `;
  return rows.length > 0 ? rowToPhoto(rows[0] as EventPhotoRow) : null;
}
