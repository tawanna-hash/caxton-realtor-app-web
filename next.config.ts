import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ensure bundled Georgia .ttf fonts ship with the agreement-pdf serverless function.
  outputFileTracingIncludes: {
    '/api/sign/**': ['./lib/pdf/fonts/**'],
    '/api/admin/agreements/**': ['./lib/pdf/fonts/**'],
    '/api/agreements/**': ['./lib/pdf/fonts/**'],
  },
  // @sparticuz/chromium ships its own native binary that must be loaded
  // outside Next.js's webpack bundle. The followed-FB-pages cron lazy-imports
  // it; marking it external prevents "cannot find module 'aws-lambda'" build
  // errors and keeps Chromium's binary in node_modules where the runtime
  // expects it.
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
};

export default nextConfig;
