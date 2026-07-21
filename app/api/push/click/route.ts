// app/api/push/click/route.ts
//
// Best-effort click tracking from the service worker's notificationclick
// handler. Increments the record-level clicked_count on the notification so
// the admin list reflects taps even from anonymous (no realtor_id) opt-ins,
// which never produced a notification_deliveries row.

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
    UPDATE notifications
       SET clicked_count = clicked_count + 1
     WHERE id = ${body.notificationId}::uuid
  `;
  return NextResponse.json({ ok: true });
}
