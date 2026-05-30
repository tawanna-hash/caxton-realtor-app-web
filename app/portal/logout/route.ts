// app/portal/logout/route.ts
//
// POST/GET — end the current portal session: clear cookie + revoke link row.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSql } from '@/lib/db';
import { PORTAL_SESSION_COOKIE } from '@/lib/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function endSession(): Promise<void> {
  const jar = await cookies();
  const linkId = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (linkId) {
    try {
      const sql = getSql();
      await sql`
        UPDATE portal_magic_links
        SET session_expires_at = NULL,
            revoked_at = NOW(),
            revoked_reason = COALESCE(revoked_reason, 'user logout')
        WHERE id = ${linkId}
      `;
    } catch (err) {
      console.error('portal logout cleanup failed', err);
    }
  }
}

export async function POST(req: NextRequest) {
  await endSession();
  const res = NextResponse.redirect(new URL('/portal/error?code=loggedout', req.url));
  res.cookies.delete(PORTAL_SESSION_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  await endSession();
  const res = NextResponse.redirect(new URL('/portal/error?code=loggedout', req.url));
  res.cookies.delete(PORTAL_SESSION_COOKIE);
  return res;
}
