// app/sitemap.ts
//
// Next.js Metadata Files API — emits /sitemap.xml at request time.
//
// Strategy: enumerate every stable, public marketing URL with a sensible
// changeFrequency + priority. Dynamic content (per-builder pages, per-event
// pages, individual magazines, individual inventory items) is intentionally
// excluded for now — we'd want to query the DB to enumerate them, which
// adds cost on every crawler hit. Stable category landing pages are enough
// to seed discovery; we can layer dynamic URLs in a follow-up once we see
// crawl traffic justify it.

import type { MetadataRoute } from 'next';

const SITE_URL = 'https://realtynewsnow.app';

type Entry = {
  path: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
};

// Top of funnel — homepage + marketing landers
const PRIMARY: Entry[] = [
  { path: '/',                    changeFrequency: 'daily',   priority: 1.0 },
  { path: '/about',               changeFrequency: 'monthly', priority: 0.7 },
  { path: '/faq',                 changeFrequency: 'monthly', priority: 0.6 },
];

// Content + community
const CONTENT: Entry[] = [
  { path: '/magazine',            changeFrequency: 'weekly',  priority: 0.8 },
  { path: '/calendar',            changeFrequency: 'daily',   priority: 0.8 },
  { path: '/communities',         changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/builders',            changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/inventory',           changeFrequency: 'daily',   priority: 0.8 },
  { path: '/advertisers',         changeFrequency: 'weekly',  priority: 0.6 },
  { path: '/giveaways',           changeFrequency: 'weekly',  priority: 0.7 },
];

// Self-serve advertising funnel
const ADVERTISE: Entry[] = [
  { path: '/advertise',           changeFrequency: 'monthly', priority: 0.9 },
  { path: '/advertise/digital',   changeFrequency: 'daily',   priority: 0.9 },
  { path: '/advertise/placements',changeFrequency: 'weekly',  priority: 0.8 },
  { path: '/advertise/print',     changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/email',     changeFrequency: 'monthly', priority: 0.7 },
  { path: '/advertise/inquire',   changeFrequency: 'monthly', priority: 0.6 },
];

// Realtor tools / lead magnets
const RESOURCES: Entry[] = [
  { path: '/resources',                          changeFrequency: 'monthly', priority: 0.7 },
  { path: '/resources/mortgage-calculator',      changeFrequency: 'yearly',  priority: 0.7 },
  { path: '/resources/commission-calculator',    changeFrequency: 'yearly',  priority: 0.7 },
  { path: '/resources/title-rate-calculator',    changeFrequency: 'yearly',  priority: 0.6 },
  { path: '/resources/seller-net-sheet',         changeFrequency: 'yearly',  priority: 0.6 },
  { path: '/resources/buyer-closing-costs',      changeFrequency: 'yearly',  priority: 0.6 },
  { path: '/resources/seller-concessions-limits',changeFrequency: 'yearly',  priority: 0.5 },
  { path: '/resources/rent-vs-buy',              changeFrequency: 'yearly',  priority: 0.5 },
  { path: '/resources/investment-property',      changeFrequency: 'yearly',  priority: 0.5 },
  { path: '/resources/1031-exchange',            changeFrequency: 'yearly',  priority: 0.5 },
];

// Conversion + retention
const FUNNEL: Entry[] = [
  { path: '/newsletter',          changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/subscribe',           changeFrequency: 'monthly', priority: 0.6 },
  { path: '/profile',             changeFrequency: 'monthly', priority: 0.3 },
];

// Legal
const LEGAL: Entry[] = [
  { path: '/privacy',             changeFrequency: 'yearly',  priority: 0.3 },
  { path: '/terms',               changeFrequency: 'yearly',  priority: 0.3 },
];

const ALL: Entry[] = [...PRIMARY, ...CONTENT, ...ADVERTISE, ...RESOURCES, ...FUNNEL, ...LEGAL];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ALL.map((e) => ({
    url: `${SITE_URL}${e.path}`,
    lastModified,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
