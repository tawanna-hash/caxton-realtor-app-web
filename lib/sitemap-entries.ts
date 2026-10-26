// lib/sitemap-entries.ts
//
// Database-backed public URL lists shared by app/sitemap.ts and the IndexNow
// cron, so both always agree on what is publicly indexable.
//
// Each entry also carries a content `fingerprint` (md5 of the row's data with
// every `*_at` timestamp column removed). The IndexNow cron compares it to the
// last submitted value, so a URL is re-pinged when its content really changes
// (event rescheduled or edited, issue re-rendered, builder inventory or
// partner profile changed) but not when a scraper merely touches
// `last_synced_at` / `updated_at`.

import { createHash } from 'node:crypto';
import type { MetadataRoute } from 'next';
import { getSql } from '@/lib/db';
import { builderNameToSlug } from '@/lib/builder-slug';

export const SITE_URL = 'https://realtynewsnow.app';

export type IndexableEntry = MetadataRoute.Sitemap[number] & { fingerprint: string };

type DbRow = Record<string, unknown>;

/** Strips volatile fields so fingerprints only change with real content. */
export function toSitemap(entries: IndexableEntry[]): MetadataRoute.Sitemap {
  return entries.map(({ fingerprint: _fp, ...rest }) => {
    void _fp;
    return rest;
  });
}

export async function magazineEntries(): Promise<IndexableEntry[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT m.id, m.sort_date,
        md5((SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
             FROM jsonb_each(to_jsonb(m))
             WHERE key NOT LIKE '%\\_at' AND key NOT IN ('page_texts'))::text) AS fp
      FROM magazines m
      WHERE m.page_count > 0
      ORDER BY m.sort_date DESC NULLS LAST
      LIMIT 500
    `) as DbRow[];
    return rows.map((r) => ({
      url: `${SITE_URL}/magazine/${r.id}`,
      lastModified: r.sort_date ? new Date(String(r.sort_date)) : undefined,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
      fingerprint: String(r.fp),
    }));
  } catch (err) {
    console.error('[sitemap] magazines failed', err);
    return [];
  }
}

export async function eventEntries(): Promise<IndexableEntry[]> {
  try {
    const sql = getSql();
    // Upcoming, visible events in the two live public markets only.
    const rows = (await sql`
      SELECT e.id, e.publication,
        md5((SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
             FROM jsonb_each(to_jsonb(e))
             WHERE key NOT LIKE '%\\_at' AND key NOT LIKE 'last\\_synced%')::text) AS fp
      FROM events e
      WHERE e.hidden = false
        AND e.publication IN ('austin', 'san_antonio')
        AND COALESCE(e.end_date, e.start_date) >=
            date_trunc('day', NOW() AT TIME ZONE 'America/Chicago')
              AT TIME ZONE 'America/Chicago'
      ORDER BY e.start_date ASC NULLS LAST
      LIMIT 1000
    `) as DbRow[];
    return rows.map((r) => ({
      url: `${SITE_URL}/calendar/${r.publication}/${r.id}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
      fingerprint: String(r.fp),
    }));
  } catch (err) {
    console.error('[sitemap] events failed', err);
    return [];
  }
}

export async function partnerEntries(): Promise<IndexableEntry[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT a.slug,
        md5((SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
             FROM jsonb_each(to_jsonb(a))
             WHERE key NOT LIKE '%\\_at' AND key NOT LIKE 'last\\_%')::text) AS fp
      FROM advertisers a
      WHERE COALESCE(a.status, 'advertiser') IN ('advertiser', 'active')
        AND a.slug IS NOT NULL AND a.slug <> ''
        AND NOT EXISTS (
          SELECT 1 FROM builder_page_visibility v
          WHERE LOWER(TRIM(v.builder_name)) = LOWER(TRIM(a.name))
            AND v.public_enabled = false
        )
    `) as DbRow[];
    return rows.map((r) => ({
      url: `${SITE_URL}/partners/${r.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
      fingerprint: String(r.fp),
    }));
  } catch (err) {
    console.error('[sitemap] partners failed', err);
    return [];
  }
}

export async function builderEntries(): Promise<IndexableEntry[]> {
  try {
    const sql = getSql();
    // Same eligibility rules as slugToBuilderName(): active inventory,
    // public page not disabled; builder and developer names both resolve.
    // Fingerprint covers every active inventory row for that name.
    const rows = (await sql`
      WITH rows AS (
        SELECT b.builder_name AS name, b.id,
          md5((SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
               FROM jsonb_each(to_jsonb(b)) WHERE key NOT LIKE '%\\_at')::text) AS h
        FROM builder_inventory b
        LEFT JOIN builder_page_visibility v ON v.builder_name = b.builder_name
        WHERE b.status = 'active' AND COALESCE(v.public_enabled, true) = true
        UNION ALL
        SELECT b.developer_name AS name, b.id,
          md5((SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
               FROM jsonb_each(to_jsonb(b)) WHERE key NOT LIKE '%\\_at')::text) AS h
        FROM builder_inventory b
        LEFT JOIN builder_page_visibility v ON v.builder_name = b.developer_name
        WHERE b.status = 'active' AND b.developer_name IS NOT NULL
          AND COALESCE(v.public_enabled, true) = true
      )
      SELECT name, string_agg(h, '' ORDER BY id) AS fp
      FROM rows WHERE name IS NOT NULL GROUP BY name
    `) as DbRow[];
    const bySlug = new Map<string, string[]>();
    for (const r of rows) {
      const slug = builderNameToSlug(String(r.name));
      if (!slug) continue;
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), String(r.fp)]);
    }
    return [...bySlug.entries()].map(([slug, fps]) => ({
      url: `${SITE_URL}/builders/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
      fingerprint: createHash('md5').update(fps.sort().join('')).digest('hex'),
    }));
  } catch (err) {
    console.error('[sitemap] builders failed', err);
    return [];
  }
}
