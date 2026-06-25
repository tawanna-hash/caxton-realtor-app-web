// app/api/push/subscribe/route.ts
//
// Public endpoint for browsers to register a Web Push subscription.
// Accepts the PushSubscription JSON produced by the service worker
// registration and stores it in push_subscriptions for later fan-out.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { withErrorHandling } from '@/lib/server/error';
import { pushSubscribeBodySchema } from '@/lib/server/schemas/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  await ensureSchema();
  const body = pushSubscribeBodySchema.parse(await req.json());
  const sub = body.subscription;

  const sql = getSql();
  const realtorId = body.realtorId ?? null;
  const market = body.market ?? null;
  const userAgent = body.userAgent ?? req.headers.get('user-agent') ?? null;

  await sql`
    INSERT INTO push_subscriptions (realtor_id, endpoint, p256dh, auth, user_agent, market)
    VALUES (${realtorId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent}, ${market})
    ON CONFLICT (endpoint) DO UPDATE
      SET realtor_id = COALESCE(EXCLUDED.realtor_id, push_subscriptions.realtor_id),
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          market = COALESCE(EXCLUDED.market, push_subscriptions.market),
          last_seen_at = NOW(),
          revoked_at = NULL
  `;

  return NextResponse.json({ ok: true });
});
