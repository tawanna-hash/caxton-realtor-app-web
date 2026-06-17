// app/robots.ts
//
// Next.js Metadata Files API — emits /robots.txt at request time.
//
// Strategy: allow crawlers across the public marketing surface, but block
// authenticated, transactional, and operational paths. Anything under
// /admin, /dashboard, /portal, /api, or the per-advertiser /checkout flow
// is either gated behind auth, expensive to render, or has no SEO value.

import type { MetadataRoute } from 'next';

const SITE_URL = 'https://realtynewsnow.app';

export default function robots(): MetadataRoute.Robots {
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
          '/r/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
