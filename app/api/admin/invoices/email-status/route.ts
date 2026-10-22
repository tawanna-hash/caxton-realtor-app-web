// GET - latest Resend status (delivered / opened / clicked / bounced ...) for
// invoice emails, recorded by the Resend webhook (app/api/webhooks/resend).

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { exec } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const r = await exec<{ email_id: string; to_addresses: string[]; subject: string; last_event: string; sent_at: string }>(
      `SELECT email_id, to_addresses, subject, last_event, sent_at FROM invoice_email_events
        WHERE subject ILIKE '%invoice%' ORDER BY sent_at DESC LIMIT 2000`,
    );
    const rows = (r.rows ?? []).map((x) => ({ id: x.email_id, to: x.to_addresses ?? [], subject: x.subject, created_at: new Date(x.sent_at).toISOString(), last_event: x.last_event }));
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] }); // table not created until the first webhook event arrives
  }
}
