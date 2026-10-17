// lib/server/portal-content.ts
//
// Auto-populated partner content. Nothing here is entered by the partner:
// it is pulled from what the team already maintains.
//   - Issues:   every published issue of the partner's publication, plus the
//               pages where the partner has a published hotspot/ad.
//   - Events:   event photos tagged to the partner (or titled with its name).
//   - Articles: published feature articles tagged to the partner.

import { getSql } from '@/lib/db';
import { listEventPhotosByAdvertiser, type EventPhotoMonth } from '@/lib/event-photos';
import { listFeatureArticlesByAdvertiser, type FeatureArticle } from '@/lib/feature-articles';

export interface PartnerIssue {
  id: number;
  label: string;
  coverUrl: string | null;
  pageCount: number;
  partnerPages: number[]; // 1-based
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function publicationFor(value: string | null | undefined): 'austin' | 'san_antonio' {
  return /san.?antonio|newsline/i.test(value ?? '') ? 'san_antonio' : 'austin';
}

export async function getPartnerIssues(advertiserId: number, publication: string | null): Promise<PartnerIssue[]> {
  const sql = getSql();
  const pub = publicationFor(publication);
  const [mags, spots] = (await Promise.all([
    sql`
      SELECT id, year, month, issue_label, cover_url, page_count
        FROM magazines
       WHERE publication = ${pub} AND page_count > 0
       ORDER BY sort_date DESC
       LIMIT 120
    `,
    sql`
      SELECT magazine_id, array_agg(DISTINCT page_idx ORDER BY page_idx) AS pages
        FROM magazine_hotspots
       WHERE advertiser_id = ${advertiserId} AND is_published = true
       GROUP BY magazine_id
    `,
  ])) as unknown as [
    { id: number; year: number | null; month: number | null; issue_label: string | null; cover_url: string | null; page_count: number }[],
    { magazine_id: number; pages: number[] }[],
  ];
  const pagesByMag = new Map(spots.map((s) => [s.magazine_id, s.pages.map((p) => Number(p) + 1)]));
  return mags.map((m) => ({
    id: m.id,
    label: m.issue_label || (m.year && m.month ? `${MONTHS[m.month - 1]} ${m.year}` : `Issue ${m.id}`),
    coverUrl: m.cover_url,
    pageCount: m.page_count,
    partnerPages: pagesByMag.get(m.id) ?? [],
  }));
}

export async function getPartnerEventMonths(advertiserId: number, name: string): Promise<EventPhotoMonth[]> {
  return listEventPhotosByAdvertiser(advertiserId, name);
}

export async function getPartnerArticles(advertiserId: number): Promise<FeatureArticle[]> {
  return listFeatureArticlesByAdvertiser(advertiserId);
}

export async function getPartnerContentCounts(advertiserId: number, name: string, publication: string | null) {
  const sql = getSql();
  const pub = publicationFor(publication);
  const [issues, res] = (await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM magazines WHERE publication = ${pub} AND page_count > 0`,
    sql`SELECT
          (SELECT COUNT(*)::int FROM portal_resources WHERE advertiser_id = ${advertiserId} AND kind = 'logo_file') + (SELECT CASE WHEN COALESCE(avatar_url, '') <> '' THEN 1 ELSE 0 END FROM advertisers WHERE id = ${advertiserId}) AS logos,
          (SELECT COUNT(*)::int FROM advertiser_locations WHERE advertiser_id = ${advertiserId}) AS locations,
          (SELECT COUNT(*)::int FROM advertiser_staff WHERE advertiser_id = ${advertiserId}) AS staff`,
  ])) as unknown as [{ n: number }[], { logos: number; locations: number; staff: number }[]];
  const [months, articles] = await Promise.all([
    getPartnerEventMonths(advertiserId, name),
    getPartnerArticles(advertiserId),
  ]);
  return {
    issues: issues[0]?.n ?? 0,
    eventPhotos: months.reduce((n, m) => n + m.photos.length, 0),
    eventMonths: months.length,
    articles: articles.length,
    logos: res[0]?.logos ?? 0,
    locations: res[0]?.locations ?? 0,
    staff: res[0]?.staff ?? 0,
  };
}
