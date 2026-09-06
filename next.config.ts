import type { NextConfig } from 'next';

// ─────────────────────────────────────────────────────────────────────────────
// Security headers (F-03 from prod audit)
//
// CSP is shipped in Report-Only mode first so production traffic isn't broken
// by an over-tight policy. After a week of clean violation reports we can flip
// the header name to `Content-Security-Policy` (enforced).
//
// Allowlist rationale:
//   - js.stripe.com, *.stripe.com  — Stripe Elements + 3DS challenge iframes
//   - us.i.posthog.com / us-assets — PostHog analytics + session recording
//   - vitals.vercel-insights.com   — Vercel Web Vitals
//   - blob.vercel-storage.com      — uploaded images (advertiser logos, mags)
//   - 'unsafe-inline' on style-src — Tailwind v4 emits inline <style>
//   - 'unsafe-eval' on script-src  — Next.js dev runtime + some 3rd-party libs
//     (only loosened in dev; production CSP omits it)
// ─────────────────────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production';

const cspDirectives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",        // Next.js inline bootstrap
    ...(isProd ? [] : ["'unsafe-eval'"]),
    'https://js.stripe.com',
    'https://us.i.posthog.com',
    'https://us-assets.i.posthog.com',
    'https://*.posthog.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https:',                 // article hero images come from many WP CDNs
  ],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'https://api.stripe.com',
    'https://us.i.posthog.com',
    'https://us-assets.i.posthog.com',
    'https://*.posthog.com',
    'https://vitals.vercel-insights.com',
    'https://*.blob.vercel-storage.com',
  ],
  'frame-src': [
    "'self'",
    'https://js.stripe.com',
    'https://hooks.stripe.com',
    'https://*.stripe.com',
  ],
  'media-src': ["'self'", 'https:', 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],          // anti-clickjacking
  'upgrade-insecure-requests': [],
};

const cspString = Object.entries(cspDirectives)
  .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
  .join('; ');

const securityHeaders = [
  // HSTS — pin HTTPS for 2 years, include subdomains.
  // Vercel sets a default, but explicit is better — and we add `preload`.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=(self)',     // address autofill on subscribe forms
      'payment=(self "https://js.stripe.com")',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()',
    ].join(', '),
  },
  // Ship CSP in Report-Only first. Flip to `Content-Security-Policy` once
  // Vercel logs are clean for a week.
  {
    key: 'Content-Security-Policy-Report-Only',
    value: cspString,
  },
];

const nextConfig: NextConfig = {
  // Keep `sharp` (libvips native bindings) and `unpdf` (bundles pdfjs-dist,
  // which references browser-only globals) out of the serverless bundle.
  // When bundled, the native .node binaries / browser globals are not
  // resolved at runtime and the function 500s before the route runs.
  serverExternalPackages: ['sharp', 'unpdf'],

  // Ensure bundled Georgia .ttf fonts ship with the agreement-pdf serverless function.
  outputFileTracingIncludes: {
    '/api/sign/**': ['./lib/pdf/fonts/**'],
    '/api/admin/agreements/**': ['./lib/pdf/fonts/**'],
    '/api/agreements/**': ['./lib/pdf/fonts/**'],
    // Pull in sharp's native libvips binaries for the GIF generator.
    '/api/admin/magazines/**': [
      './node_modules/@img/sharp-linux-x64/**',
      './node_modules/@img/sharp-libvips-linux-x64/**',
    ],
  },
  // BUG-05: legacy / SEO inbound paths that don't yet have dedicated pages.
  // Redirect to the closest existing destination instead of a bare 404.
  async redirects() {
    return [
      { source: '/feed', destination: '/dashboard', permanent: false },
      { source: '/search', destination: '/dashboard', permanent: false },
      { source: '/more', destination: '/dashboard?tab=more', permanent: false },
      { source: '/print', destination: '/magazine', permanent: false },
      { source: '/subscriptions', destination: '/newsletter', permanent: false },
      { source: '/contact', destination: '/about', permanent: false },
      { source: '/five-points', destination: '/communities', permanent: false },
      { source: '/advertisers/:path*', destination: '/partners/:path*', permanent: true },
      // Legacy /auth/* pages replaced by the /dashboard modal auth pattern.
      // Everything routes through the dashboard, which drives the Auth.js flow.
      { source: '/auth/sign-in', destination: '/dashboard?auth=login', permanent: false },
      { source: '/auth/sign-up', destination: '/dashboard?auth=signup', permanent: false },
      { source: '/auth/signup', destination: '/dashboard?auth=signup', permanent: false },
      { source: '/auth/forgot-password', destination: '/dashboard?auth=forgot', permanent: false },
      { source: '/auth/reset-password', destination: '/dashboard?auth=reset', permanent: false },
      // Preserve query string on /auth/verify so magic-link tokens still work.
      // Verify page reads ?token= and calls /api/auth/verify.
      { source: '/auth/verify', destination: '/dashboard?auth=verify', permanent: false },
    ];
  },
  // Security headers applied to every response.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
