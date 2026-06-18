// app/api/push/unsubscribe/route.ts
//
// Public endpoint for browsers to revoke their Web Push subscription.
// Marks the row revoked rather than deleting so the audit trail survives.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { endpoint?: string };

export async function POST(req: Request): Promise<Response> {
  await ensureSchema();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body?.endpoint) {
    return NextResponse.json({ error: 'missing endpoint' }, { status: 400 });
  }
  const sql = getSql();
  await sql`
    UPDATE push_subscriptions
       SET revoked_at = NOW()
     WHERE endpoint = ${body.endpoint}
  `;
  return NextResponse.json({ ok: true });
}
