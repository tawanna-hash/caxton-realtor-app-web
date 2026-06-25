// app/api/push/unsubscribe/route.ts
//
// Public endpoint for browsers to revoke their Web Push subscription.
// Marks the row revoked rather than deleting so the audit trail survives.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { withErrorHandling } from '@/lib/server/error';
import { pushUnsubscribeBodySchema } from '@/lib/server/schemas/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  await ensureSchema();
  const { endpoint } = pushUnsubscribeBodySchema.parse(await req.json());
  const sql = getSql();
  await sql`
    UPDATE push_subscriptions
       SET revoked_at = NOW()
     WHERE endpoint = ${endpoint}
  `;
  return NextResponse.json({ ok: true });
});
