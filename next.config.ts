import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ensure bundled Georgia .ttf fonts ship with the agreement-pdf serverless function.
  outputFileTracingIncludes: {
    '/api/sign/**': ['./lib/pdf/fonts/**'],
    '/api/admin/agreements/**': ['./lib/pdf/fonts/**'],
    '/api/agreements/**': ['./lib/pdf/fonts/**'],
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
