// app/api/cron/marketing-sends/route.ts
//
// Picks up marketing_campaign_outreach rows where status='scheduled' and
// scheduled_for <= NOW(), then dispatches them. Designed to run every
// 5 minutes via vercel.json.
//
// Auth: `Authorization: Bearer $CRON_SECRET` OR `x-vercel-cron: 1`.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { dispatchOutreach } from '@/lib/server/marketing-send';

export const runtime     = 'nodejs';
export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const sql = getSql();

  // Claim due-now scheduled outreach by flipping its status to 'sending'.
  // The WHERE filter on status keeps the claim safe against concurrent
  // cron invocations (only one transaction will see status='scheduled').
  const due = (await sql`
    UPDATE marketing_campaign_outreach o
    SET status = 'sending'
    WHERE o.status = 'scheduled'
      AND o.scheduled_for IS NOT NULL
      AND o.scheduled_for <= now()
    RETURNING o.id, o.campaign_id, o.subject, o.body, o.from_name, o.reply_to, o.preview_text
  `) as unknown as Array<{
    id: string; campaign_id: string;
    subject: string | null; body: string | null;
    from_name: string | null; reply_to: string | null; preview_text: string | null;
  }>;

  const results: Array<{ outreach_id: string; sent: number; failed: number; total: number }> = [];

  for (const o of due) {
    if (!o.subject || !o.body) {
      await sql`UPDATE marketing_campaign_outreach SET status = 'failed', error_message = 'missing subject or body' WHERE id = ${o.id}`;
      continue;
    }
    // Look up the campaign's publication for branding.
    const cRows = (await sql`SELECT publication FROM marketing_campaigns WHERE id = ${o.campaign_id}`) as unknown as Array<{ publication: string | null }>;
    const brand: 'realtyline' | 'newsline' | 'caxton' =
      cRows[0]?.publication === 'newsline' ? 'newsline'
      : cRows[0]?.publication === 'realtyline' ? 'realtyline'
      : 'realtyline';
    try {
      const r = await dispatchOutreach({
        outreachId: o.id,
        subject: o.subject,
        body: o.body,
        previewText: o.preview_text,
        fromName: o.from_name,
        replyTo: o.reply_to,
        brand,
      });
      results.push({ outreach_id: o.id, ...r });
    } catch (err) {
      await sql`
        UPDATE marketing_campaign_outreach
        SET status = 'failed', error_message = ${err instanceof Error ? err.message : 'dispatch error'}
        WHERE id = ${o.id}
      `;
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
