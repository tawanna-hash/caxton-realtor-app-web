import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Realty News Now',
    short_name: 'RNN',
    description:
      'Texas real estate news, magazine issues, and event alerts for RealtyLine and Newsline readers.',
    // start_url is '/?source=pwa' (NOT '/dashboard'). PR #237 (Jun 18 2026)
    // shipped exactly this value to fix the iOS Add-to-Home-Screen
    // 'couldn't load' error that the user reported live. Pointing start_url
    // at /dashboard — even though /dashboard is itself a 200 — reproduces
    // the failure on real iPhones. The combination that works is:
    //   start_url '/?source=pwa' + the passthrough SW fetch handler in sw.js.
    // The redirect from '/' to '/dashboard' is fine for Safari to follow
    // once the SW is satisfied. Do NOT change this without testing on a
    // real iPhone Add-to-Home-Screen launch.
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
