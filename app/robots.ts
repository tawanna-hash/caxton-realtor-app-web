// app/robots.ts
//
// Next.js Metadata Files API — emits /robots.txt at request time.
//
// Strategy: allow crawlers across the public marketing surface, but block
// authenticated, transactional, and operational paths. Anything under
// /admin, /dashboard, /portal, /api, or the per-advertiser /checkout flow
// is either gated behind auth, expensive to render, or has no SEO value.

import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const SITE_URL = 'https://realtynewsnow.app';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get('host') ?? '').toLowerCase().split(':')[0];
  if (host === 'itsalmostclosingtime.com' || host === 'www.itsalmostclosingtime.com') {
    const CT = 'https://itsalmostclosingtime.com';
    return {
      rules: [{ userAgent: '*', allow: '/', disallow: ['/agents/', '/admin/', '/dashboard/', '/portal/', '/api/', '/sign/', '/deal-portal/', '/book/', '/login', '/auth/', '/r/'] }],
      sitemap: `${CT}/sitemap.xml`,
      host: CT,
    };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/dashboard/',
          '/portal/',
          '/api/',
          '/advertise/checkout/',
          '/sign/',
          '/deal-portal/',
          '/r/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
