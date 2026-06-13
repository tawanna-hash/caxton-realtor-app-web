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
