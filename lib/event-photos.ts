// lib/event-photos.ts
//
// Event photo storage — Neon-backed. Powers the public /event-images
// gallery and the admin upload/manage surface.
//
// Schema:
//   event_photos (
//     id            SERIAL PK,
//     title         TEXT NOT NULL,
//     event_date    DATE NOT NULL,         -- date of the event (not upload date)
//     image_url     TEXT NOT NULL,          -- full-size image URL
//     thumbnail_url TEXT,                   -- optional separate thumbnail
//     description   TEXT,
//     publication    TEXT NOT NULL DEFAULT 'realtyline',
//     uploaded_by    TEXT,
//     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   )

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export type EventPhoto = {
  id: number;
  title: string;
  eventDate: string;       // ISO date
  imageUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  publication: string;
  uploadedBy: string | null;
  createdAt: string;
};

export type EventPhotoMonth = {
  monthKey: string;         // "2025-12"
  monthLabel: string;       // "December 2025"
  photos: EventPhoto[];
};

let schemaReady = false;

export async function ensureEventPhotosSchema() {
  if (schemaReady) return;
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
  await sql`CREATE INDEX IF NOT EXISTS idx_event_photos_date ON event_photos (event_date DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_photos_pub ON event_photos (publication)`;
  schemaReady = true;
}

function rowToPhoto(r: Record<string, any>): EventPhoto {
  return {
    id: r.id,
    title: r.title,
    eventDate: r.event_date,
    imageUrl: r.image_url,
    thumbnailUrl: r.thumbnail_url ?? null,
    description: r.description ?? null,
    publication: r.publication,
    uploadedBy: r.uploaded_by ?? null,
    createdAt: r.created_at,
  };
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export async function listEventPhotos(opts: {
  publication?: string;
  limit?: number;
}): Promise<EventPhoto[]> {
  await ensureEventPhotosSchema();
  const limit = Math.min(opts.limit ?? 500, 2000);
  const pub = opts.publication ?? 'realtyline';

  const rows = await sql`
    SELECT * FROM event_photos
    WHERE publication = ${pub}
    ORDER BY event_date DESC, created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToPhoto);
}

export async function listEventPhotosGrouped(opts: {
  publication?: string;
}): Promise<EventPhotoMonth[]> {
  const photos = await listEventPhotos(opts);
  const byMonth = new Map<string, EventPhoto[]>();

  for (const p of photos) {
    const d = new Date(p.eventDate + 'T00:00:00Z');
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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
}): Promise<EventPhoto> {
  await ensureEventPhotosSchema();
  const pub = input.publication ?? 'realtyline';

  const rows = await sql`
    INSERT INTO event_photos (title, event_date, image_url, thumbnail_url, description, publication, uploaded_by)
    VALUES (${input.title}, ${input.eventDate}, ${input.imageUrl},
            ${input.thumbnailUrl ?? null}, ${input.description ?? null},
            ${pub}, ${input.uploadedBy ?? null})
    RETURNING *
  `;
  return rowToPhoto(rows[0]);
}

export async function deleteEventPhoto(id: number): Promise<boolean> {
  await ensureEventPhotosSchema();
  const rows = await sql`
    DELETE FROM event_photos WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}
