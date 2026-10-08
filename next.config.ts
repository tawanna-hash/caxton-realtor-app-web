import type { NextConfig } from 'next';
import { OPTIMIZABLE_IMAGE_HOSTS } from './lib/optimizable-image-hosts';

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

// Enforced policy for the Closing Time domain only (itsalmostclosingtime.com). The rest of the site stays Report-Only.
// Adds Vercel Speed Insights, blob workers (PDF viewer) and blob iframes (uploaded contract preview).
const closingTimeCsp = Object.entries({
  ...cspDirectives,
  'script-src': [...cspDirectives['script-src'], 'https://va.vercel-scripts.com', 'https://www.googletagmanager.com'],
  'connect-src': [...cspDirectives['connect-src'], 'https://va.vercel-scripts.com', 'https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'],
  'frame-src': [...cspDirectives['frame-src'], 'blob:'],
  'worker-src': ["'self'", 'blob:'],
})
  .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
  .join('; ');
const closingTimeHost = [{ type: 'host' as const, value: '(www\\.)?itsalmostclosingtime\\.com' }];

// Report-Only policies ignore upgrade-insecure-requests and log a console error for it, so leave it out there.
const reportOnlyCsp = cspString.replace('; upgrade-insecure-requests', '');

const securityHeaders = [
  // HSTS — pin HTTPS for 2 years, include subdomains.
  // Vercel sets a default, but explicit is better — and we add `preload`.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
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
    value: reportOnlyCsp,
  },
];

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2592000,
    remotePatterns: OPTIMIZABLE_IMAGE_HOSTS.map((hostname) => ({ protocol: 'https' as const, hostname })),
  },

  experimental: {
    // Inline the page's CSS into the HTML so styles no longer block the first paint (PageSpeed: render-blocking requests).
    inlineCss: true,
    // Client Router Cache staleTimes: how long a page segment can be reused
    // without triggering a fresh server request when revisited via <Link>.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

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
      { source: "/rnn-platinum", destination: "/agents", permanent: true },
      // Sunset domains: newslinesa.com and realtyline.us (San Antonio /
      // Austin legacy publication sites) now point their DNS at this
      // Vercel project so they get a free, valid TLS cert instead of
      // DreamHost's redirect-only hosting (which can't terminate HTTPS
      // for a non-hosted domain). Send every path on any of the four
      // hostnames straight to the dashboard on the primary domain.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'newslinesa.com' }],
        destination: 'https://realtynewsnow.app/dashboard',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.newslinesa.com' }],
        destination: 'https://realtynewsnow.app/dashboard',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'realtyline.us' }],
        destination: 'https://realtynewsnow.app/dashboard',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.realtyline.us' }],
        destination: 'https://realtynewsnow.app/dashboard',
        permanent: true,
      },
      { source: '/feed', destination: '/dashboard', permanent: false },
      { source: '/search', destination: '/dashboard', permanent: false },
      { source: '/more', destination: '/dashboard?tab=more', permanent: false },
      { source: '/print', destination: '/magazine', permanent: false },
      { source: '/subscriptions', destination: '/newsletter', permanent: false },
      { source: '/contact', destination: '/about', permanent: false },
      { source: '/five-points', destination: '/communities', permanent: false },
      { source: '/advertisers/:path*', destination: '/partners/:path*', permanent: true },
      // Agent Deal Desk renamed to ClosingTime (Sep 2026). Redirect old links/bookmarks.
      { source: '/agents/deal-desk', destination: '/agents/closing-time', permanent: true },
      { source: '/agents/deal-desk/:path*', destination: '/agents/closing-time/:path*', permanent: true },
      // Legacy /auth/* pages replaced by the /dashboard modal auth pattern.
      // Everything routes through the dashboard, which drives the Auth.js flow.
      { source: '/auth/sign-in', destination: '/dashboard?auth=login', permanent: false },
      { source: '/auth/sign-up', has: closingTimeHost, destination: '/closing-time-signup', permanent: false },
      { source: '/auth/signup', has: closingTimeHost, destination: '/closing-time-signup', permanent: false },
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
  // Same-origin path for magazine PDFs on the blob host so the browser can
  // read Accept-Ranges/Content-Range and pdfjs can fetch only the pages
  // being viewed instead of the whole file.
  async rewrites() {
    return [
      {
        source: '/magazine-pdf/:path*',
        destination: 'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/:path*',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/:path*',
        has: closingTimeHost,
        headers: [{ key: 'Content-Security-Policy', value: closingTimeCsp }],
      },
      {
        source: '/api/agent-command-center/contracts/original',
        has: closingTimeHost,
        headers: [
          { key: 'Content-Security-Policy', value: closingTimeCsp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") },
        ],
      },
      // The saved original contract PDF is previewed in an iframe on our own
      // Agent Desk page, so allow same-origin framing for this route only.
      {
        source: '/api/agent-command-center/contracts/original',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: reportOnlyCsp.replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
          },
        ],
      },
      // Repo-hosted static assets (logos, maps, hero art). Cache for a day in
      // browsers and a week in the CDN, revalidating in the background, so
      // repeat visits skip the re-check without stranding replaced files.
      ...['partners', 'brand', 'hero', 'ads', 'product-tour'].map((dir) => ({
        source: `/${dir}/:path*`,
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
          },
        ],
      })),
    ];
  },
};

export default nextConfig;
