// app/portal/consume/route.ts
//
// GET — exchange the raw magic-link token for a portal session cookie,
//       then redirect to /portal.
//
// Flow:
//   1. /portal/consume?token=<raw>
//   2. Hash, look up row, verify not-consumed/not-revoked/not-expired.
//   3. Mark consumed_at = NOW(), session_expires_at = NOW() + 4h.
//   4. Set HttpOnly cookie (no Max-Age — dies with browser session).
//   5. Redirect to /portal.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  hashMagicLinkToken,
  isLinkConsumable,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_TTL_MS,
} from '@/lib/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return redirectToError(req, 'missing');

  try {
    await ensureSchema();
    const sql = getSql();
    const tokenHash = hashMagicLinkToken(token);

    const rows = (await sql`
      SELECT id, advertiser_id, link_expires_at, consumed_at, revoked_at
      FROM portal_magic_links
      WHERE token_hash = ${tokenHash}
    `) as unknown as {
      id: string;
      advertiser_id: number;
      link_expires_at: string;
      consumed_at: string | null;
      revoked_at: string | null;
    }[];
    if (rows.length === 0) return redirectToError(req, 'invalid');
    const row = rows[0];
    if (!isLinkConsumable(row)) return redirectToError(req, 'expired');

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null;
    const ua = req.headers.get('user-agent') ?? null;
    const sessionExpires = new Date(Date.now() + PORTAL_SESSION_TTL_MS).toISOString();

    await sql`
      UPDATE portal_magic_links
      SET consumed_at = NOW(),
          session_expires_at = ${sessionExpires},
          ip_consumed = ${ip},
          user_agent_consumed = ${ua}
      WHERE id = ${row.id}
    `;

    // Build redirect with cookie. No Max-Age = browser-close kills it.
    const res = NextResponse.redirect(new URL('/portal', req.url));
    res.cookies.set({
      name: PORTAL_SESSION_COOKIE,
      value: row.id,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // Intentionally no maxAge / expires — session cookie.
    });
    return res;
  } catch (err) {
    console.error('portal consume failed', err);
    return redirectToError(req, 'server');
  }
}

function redirectToError(req: NextRequest, code: string): NextResponse {
  const url = new URL('/portal/error', req.url);
  url.searchParams.set('code', code);
  return NextResponse.redirect(url);
}
