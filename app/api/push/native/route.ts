// app/api/push/native/route.ts
//
// Endpoint for the iOS / Android app shell to register an APNs (or FCM)
// device token. Mirrors /api/push/subscribe but takes the opaque platform
// token instead of a Web Push subscription envelope.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { withErrorHandling } from '@/lib/server/error';
import { pushNativeRegisterBodySchema } from '@/lib/server/schemas/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  await ensureSchema();
  const body = pushNativeRegisterBodySchema.parse(await req.json());

  const sql = getSql();
  const realtorId = body.realtorId ?? null;
  const market = body.market ?? null;
  const userAgent = body.userAgent ?? req.headers.get('user-agent') ?? null;
  const token = body.token.trim();

  await sql`
    INSERT INTO native_push_tokens (realtor_id, token, platform, user_agent, market)
    VALUES (${realtorId}, ${token}, ${body.platform}, ${userAgent}, ${market})
    ON CONFLICT (token) DO UPDATE
      SET realtor_id = COALESCE(EXCLUDED.realtor_id, native_push_tokens.realtor_id),
          platform = EXCLUDED.platform,
          user_agent = EXCLUDED.user_agent,
          market = COALESCE(EXCLUDED.market, native_push_tokens.market),
          last_seen_at = NOW(),
          revoked_at = NULL
  `;

  return NextResponse.json({ ok: true });
});
