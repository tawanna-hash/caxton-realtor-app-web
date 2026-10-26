// app/sitemap.ts
//
// Next.js Metadata Files API — emits /sitemap.xml at request time.
//
// Static marketing pages are listed without a lastModified value (we do not
// know their real edit dates, and a fake build-time timestamp on every URL
// teaches crawlers to ignore the field). Dynamic public pages — magazine
// issues, builder pages, partner pages — are enumerated from the database
// with real dates where one exists. Each DB lookup is isolated so a failure
// degrades to the static list instead of failing the sitemap.
//
// Intentionally excluded: /dashboard (signed-in feed, canonicalized to
// itself but not a landing target), /profile (account page), and checkout,
// signing, portal, and admin paths (also disallowed in robots.ts).

import type { MetadataRoute } from 'next';
import { getSql } from '@/lib/db';
import { builderNameToSlug } from '@/lib/builder-slug';

const SITE_URL = 'https://realtynewsnow.app';

// Cache the generated sitemap for an hour; crawlers hit it often.
export const revalidate = 3600;

type Entry = {
  path: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
};

const STATIC_ENTRIES: Entry[] = [
  { path: '/',                    changeFrequency: 'daily',   priority: 1.0 },
  { path: '/about',               changeFrequency: 'monthly', priority: 0.7 },
  { path: '/faq',                 changeFrequency: 'monthly', priority: 0.6 },
  { path: '/magazine',            changeFrequency: 'weekly',  priority: 0.8 },
  { path: '/calendar',            changeFrequency: 'daily',   priority: 0.8 },
  { path: '/communities',         changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/builders',            changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/inventory',           changeFrequency: 'daily',   priority: 0.8 },
  { path: '/partners',            changeFrequency: 'weekly',  priority: 0.6 },
  { path: '/giveaways',           changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/advertise',           changeFrequency: 'monthly', priority: 0.9 },
  { path: '/advertise/digital',   changeFrequency: 'weekly',  priority: 0.8 },
  { path: '/advertise/placements',changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/advertise/print',     changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/email',     changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/eblast',    changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/inquire',   changeFrequency: 'monthly', priority: 0.6 },
  { path: '/newsletter',          changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/subscribe',           changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacy',             changeFrequency: 'yearly',  priority: 0.3 },
  { path: '/terms',               changeFrequency: 'yearly',  priority: 0.3 },
];

type DbRow = Record<string, unknown>;

async function magazineEntries(): Promise<MetadataRoute.Sitemap> {
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

async function partnerEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT slug FROM advertisers
      WHERE COALESCE(status, 'advertiser') IN ('advertiser', 'active')
        AND slug IS NOT NULL AND slug <> ''
        AND NOT EXISTS (
          SELECT 1 FROM builder_page_visibility v
          WHERE LOWER(TRIM(v.builder_name)) = LOWER(TRIM(advertisers.name))
            AND v.public_enabled = false
        )
    `) as DbRow[];
    return rows.map((r) => ({
      url: `${SITE_URL}/partners/${r.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }));
  } catch (err) {
    console.error('[sitemap] partners failed', err);
    return [];
  }
}

async function builderEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const sql = getSql();
    // Same eligibility rules as slugToBuilderName(): active inventory,
    // public page not disabled; builder and developer names both resolve.
    const rows = (await sql`
      SELECT DISTINCT name FROM (
        SELECT b.builder_name AS name
        FROM builder_inventory b
        LEFT JOIN builder_page_visibility v ON v.builder_name = b.builder_name
        WHERE b.status = 'active' AND COALESCE(v.public_enabled, true) = true
        UNION
        SELECT b.developer_name AS name
        FROM builder_inventory b
        LEFT JOIN builder_page_visibility v ON v.builder_name = b.developer_name
        WHERE b.status = 'active' AND b.developer_name IS NOT NULL
          AND COALESCE(v.public_enabled, true) = true
      ) t WHERE name IS NOT NULL
    `) as DbRow[];
    const slugs = new Set(rows.map((r) => builderNameToSlug(String(r.name))).filter(Boolean));
    return [...slugs].map((slug) => ({
      url: `${SITE_URL}/builders/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error('[sitemap] builders failed', err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [magazines, partners, builders] = await Promise.all([
    magazineEntries(),
    partnerEntries(),
    builderEntries(),
  ]);
  const staticUrls: MetadataRoute.Sitemap = STATIC_ENTRIES.map((e) => ({
    url: e.path === '/' ? SITE_URL : `${SITE_URL}${e.path}`,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
  return [...staticUrls, ...magazines, ...builders, ...partners];
}
