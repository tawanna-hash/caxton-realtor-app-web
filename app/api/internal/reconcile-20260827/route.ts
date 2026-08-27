import { NextRequest, NextResponse } from 'next/server';
import { deleteExpired } from '@/lib/server/events-store';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAINTENANCE_TOKEN =
  '8f95a4dd05c35b6be8ae9c5ac9a9d2e61ac18e52c3dee2400c8b797602bb8902';

type ResendEmail = {
  id?: string;
  last_event?: string;
};

export async function POST(request: NextRequest) {
  if (request.headers.get('x-maintenance-token') !== MAINTENANCE_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await ensureSchema();
  const deletedEvents = await deleteExpired();
  const apiKey = process.env.RESEND_API_KEY;
  let openedBackfilled = 0;
  let clickedBackfilled = 0;

  if (apiKey) {
    const response = await fetch('https://api.resend.com/emails?limit=100', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Resend list failed: ${response.status}`);
    }

    const payload = (await response.json()) as { data?: ResendEmail[] };
    const sql = getSql();
    for (const email of payload.data ?? []) {
      if (!email.id) continue;
      if (email.last_event === 'clicked') {
        const rows = await sql`
          UPDATE marketing_campaign_outreach_recipients
          SET open_count = GREATEST(open_count, 1),
              opened_at = COALESCE(opened_at, sent_at, NOW()),
              click_count = GREATEST(click_count, 1),
              clicked_at = COALESCE(clicked_at, sent_at, NOW())
          WHERE message_id = ${email.id}
          RETURNING id
        ` as unknown as Array<{ id: string }>;
        clickedBackfilled += rows.length;
        openedBackfilled += rows.length;
      } else if (email.last_event === 'opened') {
        const rows = await sql`
          UPDATE marketing_campaign_outreach_recipients
          SET open_count = GREATEST(open_count, 1),
              opened_at = COALESCE(opened_at, sent_at, NOW())
          WHERE message_id = ${email.id}
          RETURNING id
        ` as unknown as Array<{ id: string }>;
        openedBackfilled += rows.length;
      }
    }
  }

  return NextResponse.json({
    deletedEvents,
    openedBackfilled,
    clickedBackfilled,
  });
}
