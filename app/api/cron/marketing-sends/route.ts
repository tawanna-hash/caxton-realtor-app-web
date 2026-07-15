// app/api/cron/marketing-sends/route.ts
//
// Picks up marketing_campaign_outreach rows where status='scheduled' and
// scheduled_for <= NOW(), then dispatches them. Designed to run every
// 5 minutes via vercel.json.
//
// Two paths:
//   1. One-shot scheduled sends (recurrence_interval_days IS NULL) — claim by
//      flipping status to 'sending' and dispatch the existing ledger. Unchanged.
//   2. Recurring parents (recurrence_interval_days IS NOT NULL) — claim by an
//      atomic compare-and-swap on next_run_at, spawn a child send with a fresh
//      audience, dispatch it, and advance/complete the parent.
//
// Media-kit tokens ({{print_subscribers}}, {{email_subscribers}}) are rendered
// here at send time so every fire reflects current numbers.
//
// Auth: `Authorization: Bearer $CRON_SECRET` OR `x-vercel-cron: 1`.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { dispatchOutreach, spawnRecurringChild, type RecurringParentRow } from '@/lib/server/marketing-send';
import { advanceRecurrence } from '@/lib/recurrence';
import { getMediaKitStats, formatStat } from '@/lib/media-kit';
import { fetchBlobAttachments } from '@/lib/server/blob-fetch';

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

function brandForPublication(pub: string | null | undefined): 'realtyline' | 'newsline' | 'caxton' {
  return pub === 'newsline' || pub === 'san_antonio' ? 'newsline'
    : pub === 'both' ? 'caxton'
    : 'realtyline';
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

  // Media-kit token values — resolved once per tick.
  const stats = await getMediaKitStats(sql as never);
  const extraTokens = {
    print_subscribers: formatStat(stats.print_subscribers),
    email_subscribers: formatStat(stats.email_subscribers),
  };

  // ── Path 1: one-shot scheduled outreach ─────────────────────────
  // Claim due-now scheduled outreach by flipping its status to 'sending'.
  // Recurring parents are excluded (recurrence_interval_days IS NULL) so this
  // stays exactly the pre-existing atomic-claim behavior.
  const due = (await sql`
    UPDATE marketing_campaign_outreach o
    SET status = 'sending'
    WHERE o.status = 'scheduled'
      AND o.scheduled_for IS NOT NULL
      AND o.scheduled_for <= now()
      AND o.recurrence_interval_days IS NULL
    RETURNING o.id, o.campaign_id, o.subject, o.body, o.from_name, o.reply_to,
              o.reply_to_addresses, o.preview_text, o.attachments
  `) as unknown as Array<{
    id: string; campaign_id: string;
    subject: string | null; body: string | null;
    from_name: string | null; reply_to: string | null;
    reply_to_addresses: string[] | null; preview_text: string | null;
    attachments: Array<{ filename: string; url: string; content_type?: string }> | null;
  }>;

  const results: Array<{ outreach_id: string; sent: number; failed: number; total: number }> = [];

  for (const o of due) {
    if (!o.subject || !o.body) {
      await sql`UPDATE marketing_campaign_outreach SET status = 'failed', error_message = 'missing subject or body' WHERE id = ${o.id}`;
      continue;
    }
    const cRows = (await sql`SELECT publication FROM marketing_campaigns WHERE id = ${o.campaign_id}`) as unknown as Array<{ publication: string | null }>;
    const brand = brandForPublication(cRows[0]?.publication);
    try {
      const { attachments } = await fetchBlobAttachments(o.attachments ?? undefined);
      const replyTo = (o.reply_to_addresses && o.reply_to_addresses.length > 0)
        ? o.reply_to_addresses : o.reply_to;
      const r = await dispatchOutreach({
        outreachId: o.id,
        subject: o.subject,
        body: o.body,
        previewText: o.preview_text,
        fromName: o.from_name,
        replyTo,
        brand,
        attachments: attachments.length > 0 ? attachments : undefined,
        extraTokens,
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

  // ── Path 2: recurring parents ───────────────────────────────────
  const recurringResults: Array<{
    parent_id: string; child_id: string; sent: number; failed: number; total: number;
    next_run_at: string | null; status: string;
  }> = [];

  const dueParents = (await sql`
    SELECT id, campaign_id, subject, body, from_name, reply_to, reply_to_addresses,
           preview_text, audience_sources, advertiser_filter, subscriber_filter,
           manual_emails, attachments, created_by,
           recurrence_interval_days, recurrence_until, next_run_at
    FROM marketing_campaign_outreach
    WHERE recurrence_interval_days IS NOT NULL
      AND recurrence_parent_id IS NULL
      AND status = 'scheduled'
      AND next_run_at IS NOT NULL
      AND next_run_at <= now()
  `) as unknown as Array<RecurringParentRow & {
    recurrence_interval_days: number;
    recurrence_until: string | null;
    next_run_at: string;
  }>;

  for (const p of dueParents) {
    // Compute the advance with the pure helper, then claim via optimistic CAS
    // on next_run_at so concurrent crons can't double-fire the same occurrence.
    const advance = advanceRecurrence({
      nextRunAt: new Date(p.next_run_at),
      intervalDays: p.recurrence_interval_days,
      until: p.recurrence_until ? new Date(p.recurrence_until) : null,
    });
    const newNextRunIso = advance.nextRunAt ? advance.nextRunAt.toISOString() : null;

    const claimed = (await sql`
      UPDATE marketing_campaign_outreach
      SET next_run_at = ${newNextRunIso}, status = ${advance.status}
      WHERE id = ${p.id}
        AND status = 'scheduled'
        AND next_run_at = ${p.next_run_at}
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    if (claimed.length === 0) continue; // another cron already claimed this fire

    if (!p.subject || !p.body) continue;

    const cRows = (await sql`SELECT publication FROM marketing_campaigns WHERE id = ${p.campaign_id}`) as unknown as Array<{ publication: string | null }>;
    const brand = brandForPublication(cRows[0]?.publication);

    try {
      const { childId } = await spawnRecurringChild(p);
      const { attachments } = await fetchBlobAttachments(p.attachments ?? undefined);
      const replyTo = (p.reply_to_addresses && p.reply_to_addresses.length > 0)
        ? p.reply_to_addresses : p.reply_to;
      const r = await dispatchOutreach({
        outreachId: childId,
        sourceLabel: 'recurring',
        subject: p.subject,
        body: p.body,
        previewText: p.preview_text,
        fromName: p.from_name,
        replyTo,
        repName: p.created_by,
        brand,
        attachments: attachments.length > 0 ? attachments : undefined,
        extraTokens,
      });
      recurringResults.push({
        parent_id: p.id, child_id: childId, ...r,
        next_run_at: newNextRunIso, status: advance.status,
      });
    } catch (err) {
      console.warn('[marketing-sends] recurring spawn/dispatch failed for parent', p.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    recurring_processed: recurringResults.length,
    recurring: recurringResults,
  });
}
