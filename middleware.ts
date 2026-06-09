/**
 * Middleware — publication permalink handling.
 *
 * If a request comes in with `?pub=realtyline` or `?pub=newsline`, set the
 * caxton_pub cookie, strip the query param, and 308-redirect to the clean
 * URL. This makes URLs like
 *
 *   https://realtynewsnow.app/calendar?pub=newsline
 *
 * work as durable permalinks: the cookie is persisted, the user lands on
 * the right pub on first paint, and subsequent navigation keeps the pub.
 *
 * No-op for any request without the param.
 */

import { NextRequest, NextResponse } from 'next/server';

const VALID = new Set(['realtyline', 'newsline']);

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const param = url.searchParams.get('pub');
  if (!param || !VALID.has(param)) return NextResponse.next();

  const clean = url.clone();
  clean.searchParams.delete('pub');
  const res = NextResponse.redirect(clean, 308);
  res.cookies.set('caxton_pub', param, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return res;
}

export const config = {
  // Only inspect routes that could be entry points. Skip _next, API, and
  // static asset URLs so we don't add latency to every chunk request.
  matcher: ['/((?!_next/|api/|c/|favicon|robots|sitemap|.*\\..*).*)'],
};
