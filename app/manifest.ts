import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Realty News Now',
    short_name: 'RNN',
    description:
      'Texas real estate news, magazine issues, and event alerts for RealtyLine and Newsline readers.',
    // display: 'browser' (NOT 'standalone'). History on this exact bug:
    // PRs #138-#144 (Jan) cycled through standalone fixes and ended with
    // PR #144 surrendering to 'display: browser' because the dashboard
    // bootstraps auth fetch + localStorage + PostHog on first paint and
    // the iOS standalone WebView has an isolated cookie jar / stricter
    // tracker blocking, intermittently failing to bootstrap before iOS
    // bails with 'This page couldn't load'. PRs #236-#237 (Jun)
    // reintroduced standalone without re-solving that fragility and the
    // failure returned. 'browser' keeps the home-screen icon branded and
    // installable while launching into Safari with the user's existing
    // session — no isolated WebView, no auth re-bootstrap, no error.
    // Do NOT change to 'standalone' without first making the dashboard
    // resilient to a cookieless first paint AND testing on a real iPhone.
    start_url: '/?source=pwa',
    scope: '/',
    display: 'browser',
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
