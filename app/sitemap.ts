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
// Events: upcoming, visible Austin and San Antonio events only.
//
// Intentionally excluded: /dashboard (signed-in feed, canonicalized to
// itself but not a landing target), /profile (account page), and checkout,
// signing, portal, and admin paths (also disallowed in robots.ts).

import type { MetadataRoute } from 'next';
import {
  builderEntries,
  eventEntries,
  magazineEntries,
  partnerEntries,
  toSitemap,
} from '@/lib/sitemap-entries';

const SITE_URL = 'https://realtynewsnow.app';

// Cache the generated sitemap for an hour; crawlers hit it often.
export const revalidate = 3600;

type Entry = {
  path: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
};

const STATIC_ENTRIES: Entry[] = [
  { path: '/dashboard',                   changeFrequency: 'daily',   priority: 1.0 },
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
  { path: '/advertise-to-realtors/austin',     changeFrequency: 'monthly', priority: 0.9 },
  { path: '/advertise-to-realtors/san-antonio', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/advertise/digital',   changeFrequency: 'weekly',  priority: 0.8 },
  { path: '/advertise/placements',changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/advertise/video-specs',changeFrequency: 'monthly', priority: 0.6 },
  { path: '/advertise/print',     changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/email',     changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/eblast',    changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/inquire',   changeFrequency: 'monthly', priority: 0.6 },
  { path: '/newsletter',          changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/subscribe',           changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacy',             changeFrequency: 'yearly',  priority: 0.3 },
  { path: '/terms',               changeFrequency: 'yearly',  priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [magazines, partners, builders, events] = await Promise.all([
    magazineEntries(),
    partnerEntries(),
    builderEntries(),
    eventEntries(),
  ]);
  const staticUrls: MetadataRoute.Sitemap = STATIC_ENTRIES.map((e) => ({
    url: `${SITE_URL}${e.path}`,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
  return [
    ...staticUrls,
    ...toSitemap(magazines),
    ...toSitemap(builders),
    ...toSitemap(partners),
    ...toSitemap(events),
  ];
}
