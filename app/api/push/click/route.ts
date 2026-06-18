// app/api/push/click/route.ts
//
// Best-effort click tracking from the service worker's notificationclick
// handler. Stamps clicked_at on the corresponding notification_deliveries
// row(s). Idempotent — only updates the most recent unclicked delivery.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { notificationId?: string };

export async function POST(req: Request): Promise<Response> {
  await ensureSchema();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body?.notificationId) {
    return NextResponse.json({ error: 'missing notificationId' }, { status: 400 });
  }
  const sql = getSql();
  await sql`
    UPDATE notification_deliveries
       SET clicked_at = NOW()
     WHERE notification_id = ${body.notificationId}::uuid
       AND clicked_at IS NULL
  `;
  return NextResponse.json({ ok: true });
}
