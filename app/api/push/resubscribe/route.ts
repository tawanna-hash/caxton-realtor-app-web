// app/api/push/resubscribe/route.ts
//
// Browser fires a `pushsubscriptionchange` event when the push service
// rotates an endpoint. The service worker re-subscribes and posts the new
// PushSubscription here so we can swap it in without losing the row.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  oldEndpoint?: string | null;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
};

export async function POST(req: Request): Promise<Response> {
  await ensureSchema();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'missing subscription fields' }, { status: 400 });
  }
  const sql = getSql();

  if (body.oldEndpoint && body.oldEndpoint !== sub.endpoint) {
    // Migrate the old row to the new endpoint so we preserve realtor_id/market.
    await sql`
      UPDATE push_subscriptions
         SET endpoint = ${sub.endpoint},
             p256dh = ${sub.keys.p256dh},
             auth = ${sub.keys.auth},
             last_seen_at = NOW(),
             revoked_at = NULL
       WHERE endpoint = ${body.oldEndpoint}
    `;
  } else {
    await sql`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth)
      VALUES (${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
      ON CONFLICT (endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            last_seen_at = NOW(),
            revoked_at = NULL
    `;
  }

  return NextResponse.json({ ok: true });
}
