import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep `sharp` (libvips native bindings) out of the serverless bundle.
  // When bundled, the native .node binaries are not resolved at runtime
  // and the function 500s before the route handler even runs.
  serverExternalPackages: ['sharp'],

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
  // Launch-day cache reset: iOS Safari aggressively caches HTML responses
  // for home-screen WebClips. During launch some users hit a broken response
  // (PWA standalone mode bug from PR #138-#140) that iOS pinned to the icon
  // even after we shipped fixes. These headers ensure (a) every HTML response
  // is never cached by the browser, and (b) /dashboard explicitly clears any
  // stale storage on first visit so a broken pinned response can self-heal.
  async headers() {
    return [
      {
        // One-shot purge: when iOS opens /dashboard (the WebClip start_url),
        // clear any cached responses Safari might be holding from yesterday's
        // broken WebClip standalone responses. Clear-Site-Data is supported
        // on iOS 16.4+. We also send no-store so Safari never re-caches a
        // broken response again.
        source: '/dashboard',
        headers: [
          { key: 'Clear-Site-Data', value: '"cache"' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
        ],
      },
      {
        // Manifest must always be fresh so changes to start_url / display /
        // icons reach the WebClip on the next "Add to Home Screen".
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
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
    ];
  },
};

export default nextConfig;
