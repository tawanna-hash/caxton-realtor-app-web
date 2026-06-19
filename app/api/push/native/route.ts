// app/api/push/native/route.ts
//
// Endpoint for the iOS / Android app shell to register an APNs (or FCM)
// device token. Mirrors /api/push/subscribe but takes the opaque platform
// token instead of a Web Push subscription envelope.
//
// PR B (App Store readiness) introduces this route; the actual fan-out
// sender for native tokens will land in a follow-up alongside the APNs
// authentication key setup. For now this row just records who opted in.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  token?: string;
  platform?: 'ios' | 'android';
  realtorId?: string | null;
  market?: string | null;
  userAgent?: string | null;
};

export async function POST(req: Request): Promise<Response> {
  await ensureSchema();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const token = (body.token || '').trim();
  if (!token) {
    return NextResponse.json({ error: 'missing token' }, { status: 400 });
  }

  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
  if (!platform) {
    return NextResponse.json({ error: 'invalid platform' }, { status: 400 });
  }

  const sql = getSql();
  const realtorId = body.realtorId || null;
  const market = body.market || null;
  const userAgent = body.userAgent || req.headers.get('user-agent') || null;

  await sql`
    INSERT INTO native_push_tokens (realtor_id, token, platform, user_agent, market)
    VALUES (${realtorId}, ${token}, ${platform}, ${userAgent}, ${market})
    ON CONFLICT (token) DO UPDATE
      SET realtor_id = COALESCE(EXCLUDED.realtor_id, native_push_tokens.realtor_id),
          platform = EXCLUDED.platform,
          user_agent = EXCLUDED.user_agent,
          market = COALESCE(EXCLUDED.market, native_push_tokens.market),
          last_seen_at = NOW(),
          revoked_at = NULL
  `;

  return NextResponse.json({ ok: true });
}
