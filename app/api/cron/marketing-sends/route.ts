// app/api/cron/marketing-sends/route.ts
//
// Picks up marketing_campaign_outreach rows where status='scheduled' and
// scheduled_for <= NOW(), then dispatches them. Designed to run every
// 5 minutes via vercel.json.
//
// When a fired row has recurrence_interval_days set, we:
//   1) re-materialize the audience from audience_snapshot (so new prospects
//      are included and unsubscribes drop out on each fire)
//   2) after successful dispatch, insert a NEW child outreach row scheduled
//      for scheduled_for + interval days, carrying forward all recurrence
//      fields — until recurrence_until is passed.
//
// Auth: `Authorization: Bearer $CRON_SECRET` OR `x-vercel-cron: 1`.

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import {
  dispatchOutreach,
  materializeAudience,
  insertRecipientsLedger,
  buildMediaKitTokens,
  type RecipientSeed,
} from '@/lib/server/marketing-send';
import { fetchAttachmentContent, type AttachmentRef } from '@/lib/server/email-attachments';
import {
  resolveCrmAudience,
  type CrmAudienceFilter,
} from '@/app/api/admin/crm-email/_shared';

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

interface DueRow {
  id: string;
  campaign_id: string;
  subject: string | null;
  body: string | null;
  from_name: string | null;
  reply_to: string | null;
  preview_text: string | null;
  recurrence_interval_days: number | null;
  recurrence_until: string | null;
  recurrence_parent_id: string | null;
  audience_snapshot: unknown;
  reply_to_list: unknown;
  attachments: unknown;
  attachment_link_url: string | null;
  attachment_link_label: string | null;
  scheduled_for: string;
}

interface AudienceSnapshot {
  sources?: Array<'advertisers' | 'subscribers' | 'segment' | 'manual'>;
  advertiserFilter?: Record<string, unknown>;
  crmFilter?: CrmAudienceFilter;
  subscriberFilter?: {
    publication?: 'realtyline' | 'newsline';
    status?: 'active' | 'unsubscribed';
    verified?: string;
  };
  manualEmails?: string[];
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  // removed: ensureSchema() — crons should not run DDL
  const sql = getSql();

  // Claim due-now scheduled outreach by flipping its status to 'sending'.
  const due = (await sql`
    UPDATE marketing_campaign_outreach o
    SET status = 'sending'
    WHERE o.status = 'scheduled'
      AND o.scheduled_for IS NOT NULL
      AND o.scheduled_for <= now()
    RETURNING o.id, o.campaign_id, o.subject, o.body, o.from_name, o.reply_to,
              o.preview_text, o.recurrence_interval_days, o.recurrence_until,
              o.recurrence_parent_id, o.audience_snapshot, o.reply_to_list,
              o.attachments, o.attachment_link_url, o.attachment_link_label, o.scheduled_for
  `) as unknown as DueRow[];

  const results: Array<{ outreach_id: string; sent: number; failed: number; total: number; next?: string | null }> = [];

  for (const o of due) {
    if (!o.subject || !o.body) {
      await sql`UPDATE marketing_campaign_outreach SET status = 'failed', error_message = 'missing subject or body' WHERE id = ${o.id}`;
      continue;
    }

    // Look up the campaign's publication for branding + media-kit tokens.
    const cRows = (await sql`SELECT publication FROM marketing_campaigns WHERE id = ${o.campaign_id}`) as unknown as Array<{ publication: string | null }>;
    const publication = cRows[0]?.publication ?? null;
    const brand: 'realtyline' | 'newsline' | 'caxton' =
      publication === 'newsline' ? 'newsline'
      : publication === 'realtyline' ? 'realtyline'
      : 'realtyline';

    try {
      // Re-materialize audience on each fire when a snapshot is present.
      // This picks up newly-added prospects and drops recent unsubscribes.
      const snapshot = o.audience_snapshot as AudienceSnapshot | null;
      const ledgerRows = (await sql`
        SELECT count(*)::int AS count
        FROM marketing_campaign_outreach_recipients
        WHERE outreach_id = ${o.id}
      `) as unknown as Array<{ count: number }>;
      const hasStoredRecipients = (ledgerRows[0]?.count ?? 0) > 0;
      if (
        !hasStoredRecipients
        && snapshot
        && Array.isArray(snapshot.sources)
        && snapshot.sources.length > 0
      ) {
        let seeds: RecipientSeed[];
        if (snapshot.crmFilter) {
          const crmRows = await resolveCrmAudience(snapshot.crmFilter);
          const seen = new Set<string>();
          seeds = crmRows.map((row) => {
            seen.add(row.email.trim().toLowerCase());
            return {
              recipient_type: 'advertiser' as const,
              recipient_id: row.id,
              email: row.email,
              first_name: row.first_name,
              last_name: row.last_name,
              company: row.company,
            };
          });
          for (const raw of snapshot.manualEmails ?? []) {
            const email = raw.trim();
            const key = email.toLowerCase();
            if (!email || seen.has(key)) continue;
            seen.add(key);
            seeds.push({
              recipient_type: 'manual',
              recipient_id: null,
              email,
              first_name: null,
              last_name: null,
              company: null,
            });
          }
        } else {
          seeds = await materializeAudience({
            sources: snapshot.sources,
            advertiserFilter: snapshot.advertiserFilter,
            subscriberFilter: snapshot.subscriberFilter,
            manualEmails: snapshot.manualEmails,
          });
        }
        if (seeds.length > 0) {
          await insertRecipientsLedger(o.id, seeds);
        }
      }

      // Multi reply-to: prefer array from reply_to_list, fall back to single.
      const replyToList = Array.isArray(o.reply_to_list) ? (o.reply_to_list as string[]).filter((s) => typeof s === 'string' && s.length > 0) : null;
      const replyTo: string | string[] | null =
        replyToList && replyToList.length > 0 ? replyToList
        : (o.reply_to ?? null);

      // Attachments: fetch each from Blob URL (or inline content) at send time.
      const attachmentRefs = Array.isArray(o.attachments) ? (o.attachments as AttachmentRef[]) : [];
      const attachments: Array<{ filename: string; content: string; contentType?: string }> = [];
      for (const a of attachmentRefs) {
        const resolved = await fetchAttachmentContent(a);
        if (resolved) attachments.push(resolved);
      }

      // Media-kit tokens — injected via body/subject substitution below.
      // substituteTokens runs per-recipient inside buildEmail; the tokens
      // need to be in each recipient's TokenContext. Since the recipient
      // context is built inside sendOneRecipient's TokenContext (open type),
      // we pre-expand the subject/body here so the values are baked in for
      // this fire (matches the media kit that was current at send time).
      const mkt = buildMediaKitTokens(publication);
      const subjectExpanded = o.subject
        .replace(/\{\{\s*print_subscribers\s*\}\}/gi, mkt.print_subscribers)
        .replace(/\{\{\s*email_subscribers\s*\}\}/gi, mkt.email_subscribers);
      const bodyExpanded = o.body
        .replace(/\{\{\s*print_subscribers\s*\}\}/gi, mkt.print_subscribers)
        .replace(/\{\{\s*email_subscribers\s*\}\}/gi, mkt.email_subscribers);

      // Attachment-as-link: render download button HTML appended to body.
      // Bypasses the 413 attachment ceiling (Vercel 4.5 MB body limit ×
      // base64 overhead). For >~3 MB PDFs, use this path instead of
      // `attachments`.
      let bodyWithLink = bodyExpanded;
      if (o.attachment_link_url) {
        const label = o.attachment_link_label || 'Download attachment';
        const safeUrl = o.attachment_link_url.replace(/"/g, '&quot;');
        const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        bodyWithLink += `
<div style="margin:32px 0;text-align:center;">
  <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;background:#5a0e5f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${safeLabel}</a>
</div>`;
      }

      const r = await dispatchOutreach({
        outreachId: o.id,
        subject: subjectExpanded,
        body: bodyWithLink,
        previewText: o.preview_text,
        fromName: o.from_name,
        replyTo,
        brand,
        attachments: attachments.length > 0 ? attachments : undefined,
        attachmentLinks: attachmentRefs.length > 0
          ? attachmentRefs.filter((a) => a.url).map((a) => ({ filename: a.filename, url: a.url as string }))
          : undefined,
      });

      // Chain-insert the next occurrence if within window.
      let nextIso: string | null = null;
      try {
        if (o.recurrence_interval_days && o.recurrence_interval_days > 0) {
          const nextTs = (await sql`
            SELECT (${o.scheduled_for}::timestamptz + (${o.recurrence_interval_days}::int || ' days')::interval) AS next
          `) as unknown as Array<{ next: string }>;
          const nextRun = nextTs[0]?.next;
          const until = o.recurrence_until ? new Date(o.recurrence_until) : null;
          const nextDate = nextRun ? new Date(nextRun) : null;
          if (nextRun && (!until || (nextDate && nextDate <= until))) {
            const parentId = o.recurrence_parent_id ?? o.id;
            await sql`
              INSERT INTO marketing_campaign_outreach (
                campaign_id, channel, subject, body, status, scheduled_for,
                from_name, reply_to, preview_text,
                recurrence_interval_days, recurrence_until, recurrence_parent_id,
                audience_snapshot, reply_to_list, attachments,
                attachment_link_url, attachment_link_label,
                created_by
              ) VALUES (
                ${o.campaign_id}, 'email', ${o.subject}, ${o.body}, 'scheduled', ${nextRun},
                ${o.from_name}, ${o.reply_to}, ${o.preview_text},
                ${o.recurrence_interval_days}, ${o.recurrence_until}, ${parentId},
                ${o.audience_snapshot ? JSON.stringify(o.audience_snapshot) : null}::jsonb,
                ${o.reply_to_list ? JSON.stringify(o.reply_to_list) : null}::jsonb,
                ${o.attachments ? JSON.stringify(o.attachments) : null}::jsonb,
                ${o.attachment_link_url}, ${o.attachment_link_label},
                'cron:recurrence'
              )
            `;
            nextIso = nextRun;
          }
        }
      } catch (err) {
        const recurrenceError = err instanceof Error ? err.message : 'unknown recurrence scheduling error';
        await sql`
          UPDATE marketing_campaign_outreach
          SET error_message = ${`Next recurring send was not scheduled: ${recurrenceError}`}
          WHERE id = ${o.id}
        `;
      }

      results.push({ outreach_id: o.id, ...r, next: nextIso });
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
