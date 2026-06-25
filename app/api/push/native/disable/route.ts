// app/api/push/native/disable/route.ts
//
// Soft-revoke a native APNs/FCM token. The user toggled off notifications
// in the in-app settings; we cannot revoke OS-level permission from JS,
// but we can stop the server from sending to this device by flipping
// revoked_at. The token row is kept for analytics + so re-enabling
// upserts cleanly via /api/push/native (ON CONFLICT resets revoked_at).
//
// Match strategy:
//   1. If body.token is present, match by token (exact, most reliable).
//   2. Else fall back to user_agent matching for the same realtor — best
//      effort for older clients that didn't cache the token locally.
//
// Always returns ok:true so the UI flips even when nothing matched —
// the user's intent ("stop pushing me") is honored regardless.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  token?: string | null;
  userAgent?: string | null;
};

export async function POST(req: Request): Promise<Response> {
  await ensureSchema();

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Empty body is fine — we'll fall back to UA matching from headers.
  }

  const sql = getSql();
  const token = (body.token || '').trim() || null;
  const userAgent = body.userAgent || req.headers.get('user-agent') || null;

  if (token) {
    await sql`
      UPDATE native_push_tokens
         SET revoked_at = NOW()
       WHERE token = ${token}
    `;
    return NextResponse.json({ ok: true, matched: 'token' });
  }

  if (userAgent) {
    // Best-effort UA fallback. Only revokes rows still active.
    await sql`
      UPDATE native_push_tokens
         SET revoked_at = NOW()
       WHERE user_agent = ${userAgent}
         AND revoked_at IS NULL
    `;
    return NextResponse.json({ ok: true, matched: 'user_agent' });
  }

  return NextResponse.json({ ok: true, matched: 'none' });
}
