// app/.well-known/apple-app-site-association/route.ts
//
// Apple App Site Association (AASA) — required for iOS Universal Links to
// open https://realtynewsnow.app URLs directly in the Realty News Now iOS
// app instead of Safari.
//
// Apple fetches this file from /.well-known/apple-app-site-association on
// app install and periodically thereafter. It MUST:
//   - be served over HTTPS (no redirects — Apple won't follow them)
//   - return Content-Type: application/json
//   - return a 200 OK with the JSON body below
//
// App ID format: <TEAM_ID>.<BUNDLE_ID>
//   Team ID:    3JU7K7AMUY   (Caxton Publications, from developer.apple.com)
//   Bundle ID:  com.realtynewsnow.app  (from caxton-realtor-ios/app.json)
//
// Paths "*" + "NOT" /api/* and /.well-known/* means every public page on
// realtynewsnow.app opens in-app when the user has the app installed.
// API + well-known paths stay in Safari/curl/etc.
//
// Reference: https://developer.apple.com/documentation/xcode/supporting-associated-domains

import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 3600; // 1 hour — Apple caches it, but allow updates

const APP_ID = '3JU7K7AMUY.com.realtynewsnow.app';

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: APP_ID,
        appIDs: [APP_ID],
        paths: [
          'NOT /api/*',
          'NOT /.well-known/*',
          '/',
          '/today',
          '/today/*',
          '/articles/*',
          '/issues',
          '/issues/*',
          '/magazines/*',
          '/builders',
          '/builders/*',
          '/communities',
          '/communities/*',
          '/inventory',
          '/inventory/*',
          '/calendar',
          '/calendar/*',
          '/about',
          '/faq',
          '/search',
          '/search/*',
        ],
        components: [
          { '/': '/api/*', exclude: true },
          { '/': '/.well-known/*', exclude: true },
          { '/': '/*' },
        ],
      },
    ],
  },
  webcredentials: {
    apps: [APP_ID],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // No max-age — let Apple's CDN cache decide; the file rarely changes
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
