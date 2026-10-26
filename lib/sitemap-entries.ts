// lib/sitemap-entries.ts
//
// Database-backed public URL lists shared by app/sitemap.ts and the IndexNow
// cron, so both always agree on what is publicly indexable.

import type { MetadataRoute } from 'next';
import { getSql } from '@/lib/db';

export const SITE_URL = 'https://realtynewsnow.app';

type DbRow = Record<string, unknown>;

export async function magazineEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, sort_date FROM magazines
      WHERE page_count > 0
      ORDER BY sort_date DESC NULLS LAST
      LIMIT 500
    `) as DbRow[];
    return rows.map((r) => ({
      url: `${SITE_URL}/magazine/${r.id}`,
      lastModified: r.sort_date ? new Date(String(r.sort_date)) : undefined,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error('[sitemap] magazines failed', err);
    return [];
  }
}

export async function eventEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const sql = getSql();
    // Upcoming, visible events in the two live public markets only.
    const rows = (await sql`
      SELECT id, publication, start_date FROM events
      WHERE hidden = false
        AND publication IN ('austin', 'san_antonio')
        AND COALESCE(end_date, start_date) >=
            date_trunc('day', NOW() AT TIME ZONE 'America/Chicago')
              AT TIME ZONE 'America/Chicago'
      ORDER BY start_date ASC NULLS LAST
      LIMIT 1000
    `) as DbRow[];
    return rows.map((r) => ({
      url: `${SITE_URL}/calendar/${r.publication}/${r.id}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch (err) {
    console.error('[sitemap] events failed', err);
    return [];
  }
}
