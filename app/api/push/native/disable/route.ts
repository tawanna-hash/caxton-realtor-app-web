// app/api/push/native/disable/route.ts
//
// Soft-revoke a native APNs/FCM token. The user toggled off notifications
// in the in-app settings; we cannot revoke OS-level permission from JS,
// but we can stop the server from sending to this device by flipping
// revoked_at. The token row is kept for analytics + so re-enabling
// upserts cleanly via /api/push/native (ON CONFLICT resets revoked_at).
//
// Always returns ok:true so the UI flips even when nothing matched —
// the user's intent ("stop pushing me") is honored regardless.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { withErrorHandling } from '@/lib/server/error';
import { pushNativeDisableBodySchema } from '@/lib/server/schemas/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  await ensureSchema();

  // Empty body is fine — fall back to UA matching from headers.
  let raw: unknown = {};
  try { raw = await req.json(); } catch { /* empty body */ }
  const body = pushNativeDisableBodySchema.parse(raw ?? {});

  const sql = getSql();
  const token = (body.token ?? '').trim() || null;
  const userAgent = body.userAgent ?? req.headers.get('user-agent') ?? null;

  if (token) {
    await sql`
      UPDATE native_push_tokens
         SET revoked_at = NOW()
       WHERE token = ${token}
    `;
    return NextResponse.json({ ok: true, matched: 'token' });
  }

  if (userAgent) {
    await sql`
      UPDATE native_push_tokens
         SET revoked_at = NOW()
       WHERE user_agent = ${userAgent}
         AND revoked_at IS NULL
    `;
    return NextResponse.json({ ok: true, matched: 'user_agent' });
  }

  return NextResponse.json({ ok: true, matched: 'none' });
});
