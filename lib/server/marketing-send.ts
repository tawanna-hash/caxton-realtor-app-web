// lib/server/marketing-send.ts
//
// Server-only helpers shared between the send-now endpoint and the
// scheduled-send cron. Resolves audience -> recipients ledger -> Resend.

import { getSql } from '@/lib/db';
import { resolveAudience, type AudienceFilter, type OutreachAudienceSource } from '@/lib/marketing-campaigns';
import { sendOneRecipient, makeUnsubToken } from '@/lib/marketing-email';
import { syncProspectFromOutreach } from '@/lib/server/marketing-prospect-sync';

export interface MaterializeAudienceInput {
  sources: OutreachAudienceSource[];
  advertiserFilter?: AudienceFilter;
  subscriberFilter?: {
    publication?: 'realtyline' | 'newsline';
    status?: 'active' | 'unsubscribed';
    verified?: string;
  };
  manualEmails?: string[];
}

export interface RecipientSeed {
  recipient_type: 'advertiser' | 'subscriber' | 'manual';
  recipient_id: number | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

// Build the deduplicated recipient list from the multi-source input.
export async function materializeAudience(input: MaterializeAudienceInput): Promise<RecipientSeed[]> {
  const sql = getSql();
  const seen = new Set<string>();
  const out: RecipientSeed[] = [];

  if (input.sources.includes('advertisers')) {
    const ids = await resolveAudience(sql as never, input.advertiserFilter ?? {});
    if (ids.length > 0) {
      const rows = (await sql`
        SELECT id, email, first_name, last_name, company
        FROM advertisers
        WHERE id = ANY(${ids}::int[])
          AND email IS NOT NULL AND length(trim(email)) > 0
      `) as unknown as Array<{
        id: number; email: string; first_name: string | null; last_name: string | null; company: string | null;
      }>;
      for (const r of rows) {
        const key = r.email.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          recipient_type: 'advertiser',
          recipient_id: r.id,
          email: r.email,
          first_name: r.first_name,
          last_name: r.last_name,
          company: r.company,
        });
      }
    }
  }

  if (input.sources.includes('subscribers') || input.sources.includes('segment')) {
    const f = input.subscriberFilter ?? {};
    const rows = (await sql`
      SELECT n.id, n.email
      FROM newsletter_subscribers n
      LEFT JOIN email_verifications ev ON ev.email = lower(n.email)
      WHERE COALESCE(n.status, 'active') = COALESCE(${f.status ?? null}, COALESCE(n.status, 'active'))
        AND (${f.publication ?? null}::text IS NULL OR n.publication = ${f.publication ?? null})
        AND (
          ${f.verified ?? null}::text IS NULL
          OR (${f.verified ?? null} = 'unverified' AND ev.status IS NULL)
          OR (${f.verified ?? null} <> 'unverified' AND ev.status = ${f.verified ?? null})
        )
      LIMIT 100000
    `) as unknown as Array<{ id: number; email: string }>;
    for (const r of rows) {
      const key = r.email.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        recipient_type: 'subscriber',
        recipient_id: r.id,
        email: r.email,
        first_name: null,
        last_name: null,
        company: null,
      });
    }
  }

  if (input.sources.includes('manual') && input.manualEmails) {
    for (const raw of input.manualEmails) {
      const key = raw.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        recipient_type: 'manual',
        recipient_id: null,
        email: raw.trim(),
        first_name: null,
        last_name: null,
        company: null,
      });
    }
  }

  return out;
}

// Insert recipients ledger rows for an outreach. Returns the inserted rows
// with their ids + unsub tokens, so the send pipeline can render emails.
export async function insertRecipientsLedger(
  outreachId: string,
  seeds: RecipientSeed[],
): Promise<Array<RecipientSeed & { id: string; unsub_token: string }>> {
  if (seeds.length === 0) return [];
  const sql = getSql();
  const inserted: Array<RecipientSeed & { id: string; unsub_token: string }> = [];
  // Neon's tagged-template driver doesn't accept array-of-rows VALUES, so we
  // insert in batches via a single SQL with unnested arrays. Cap each batch
  // at 2000 to stay well under any param/size limits.
  const BATCH = 2000;
  for (let i = 0; i < seeds.length; i += BATCH) {
    const batch = seeds.slice(i, i + BATCH);
    const tokens = batch.map(() => makeUnsubToken());
    const rows = (await sql`
      INSERT INTO marketing_campaign_outreach_recipients
        (outreach_id, recipient_type, recipient_id, email, first_name, last_name, company, unsub_token)
      SELECT
        ${outreachId}::uuid,
        rt.recipient_type, rt.recipient_id, rt.email, rt.first_name, rt.last_name, rt.company, rt.unsub_token
      FROM jsonb_to_recordset(${JSON.stringify(batch.map((s, idx) => ({ ...s, unsub_token: tokens[idx] })))}::jsonb)
        AS rt(
          recipient_type text,
          recipient_id integer,
          email text,
          first_name text,
          last_name text,
          company text,
          unsub_token text
        )
      RETURNING id, recipient_type, recipient_id, email, first_name, last_name, company, unsub_token
    `) as unknown as Array<{
      id: string; recipient_type: 'advertiser' | 'subscriber' | 'manual'; recipient_id: number | null;
      email: string; first_name: string | null; last_name: string | null; company: string | null;
      unsub_token: string;
    }>;
    for (const r of rows) inserted.push(r);
  }
  return inserted;
}

// ── Recurring child spawn ──────────────────────────────────────────
// A recurring parent stores the audience DEFINITION (sources + filters).
// On each fire the dispatcher calls this to (1) insert a fresh child
// outreach row referencing the parent and (2) re-materialize the audience
// into the child's recipients ledger — so newly added advertisers are
// included and unsubscribed ones excluded on every send.
export interface RecurringParentRow {
  id: string;
  campaign_id: string;
  subject: string | null;
  body: string | null;
  from_name: string | null;
  reply_to: string | null;
  reply_to_addresses: string[] | null;
  preview_text: string | null;
  audience_sources: OutreachAudienceSource[] | null;
  advertiser_filter: AudienceFilter | null;
  subscriber_filter: MaterializeAudienceInput['subscriberFilter'] | null;
  manual_emails: string[] | null;
  attachments: Array<{ filename: string; url: string; content_type?: string }> | null;
  created_by: string | null;
}

export interface SpawnChildResult {
  childId: string;
  recipientCount: number;
}

export async function spawnRecurringChild(parent: RecurringParentRow): Promise<SpawnChildResult> {
  const sql = getSql();
  const sources = (parent.audience_sources ?? []) as OutreachAudienceSource[];

  // Re-materialize the audience fresh at fire time.
  const seeds = await materializeAudience({
    sources,
    advertiserFilter: parent.advertiser_filter ?? undefined,
    subscriberFilter: parent.subscriber_filter ?? undefined,
    manualEmails: parent.manual_emails ?? undefined,
  });

  const created = (await sql`
    INSERT INTO marketing_campaign_outreach (
      campaign_id, channel, subject, body, status, scheduled_for,
      recipient_ids, recipient_count, audience_sources, subscriber_ids, manual_emails,
      from_name, reply_to, preview_text, created_by,
      recurrence_parent_id, advertiser_filter, subscriber_filter, attachments, reply_to_addresses
    ) VALUES (
      ${parent.campaign_id}, 'email',
      ${parent.subject}, ${parent.body},
      'sending', now(),
      ${JSON.stringify(seeds.filter(s => s.recipient_type === 'advertiser').map(s => s.recipient_id))}::jsonb,
      ${seeds.length},
      ${JSON.stringify(sources)}::jsonb,
      ${JSON.stringify(seeds.filter(s => s.recipient_type === 'subscriber').map(s => s.recipient_id))}::jsonb,
      ${JSON.stringify(seeds.filter(s => s.recipient_type === 'manual').map(s => s.email))}::jsonb,
      ${parent.from_name}, ${parent.reply_to}, ${parent.preview_text}, ${parent.created_by},
      ${parent.id},
      ${parent.advertiser_filter ? JSON.stringify(parent.advertiser_filter) : null}::jsonb,
      ${parent.subscriber_filter ? JSON.stringify(parent.subscriber_filter) : null}::jsonb,
      ${JSON.stringify(parent.attachments ?? [])}::jsonb,
      ${JSON.stringify(parent.reply_to_addresses ?? [])}::jsonb
    ) RETURNING id
  `) as unknown as Array<{ id: string }>;
  const childId = created[0].id;

  await insertRecipientsLedger(childId, seeds);
  return { childId, recipientCount: seeds.length };
}

// Fan out a single outreach: render + send each recipient via Resend,
// updating the ledger per-row, and finally aggregate stats onto the outreach.
export interface DispatchInput {
  outreachId: string;
  subject: string;
  body: string;
  previewText?: string | null;
  fromName?: string | null;
  replyTo?: string | string[] | null;
  repName?: string | null;
  brand?: 'realtyline' | 'newsline' | 'caxton';
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  sourceLabel?: string;
  // Non-per-recipient tokens (media-kit stats) resolved once at send time.
  extraTokens?: Record<string, string>;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  total: number;
}

export async function dispatchOutreach(input: DispatchInput): Promise<DispatchResult> {
  const sql = getSql();
  // Pull pending recipients (so a retry of a partial send is idempotent for
  // already-sent rows).
  const recipients = (await sql`
    SELECT id, email, first_name, last_name, company, unsub_token
    FROM marketing_campaign_outreach_recipients
    WHERE outreach_id = ${input.outreachId} AND status = 'pending'
    ORDER BY created_at ASC
  `) as unknown as Array<{
    id: string; email: string; first_name: string | null; last_name: string | null;
    company: string | null; unsub_token: string | null;
  }>;

  let sent = 0;
  let failed = 0;

  const from = input.fromName
    ? `${input.fromName} <${(process.env.EMAIL_FROM ?? 'hello@myrealtyline.com').replace(/^.*<|>$/g, '')}>`
    : undefined;

  // Serial send to stay polite with Resend rate limits (10/s default).
  // If we ever need higher throughput, switch to p-limit at concurrency 5.
  for (const r of recipients) {
    const res = await sendOneRecipient({
      subject: input.subject,
      body: input.body,
      previewText: input.previewText,
      recipient: r,
      repName: input.repName ?? null,
      brand: input.brand,
      from,
      replyTo: input.replyTo ?? undefined,
      attachments: input.attachments,
      extraTokens: input.extraTokens,
    });
    if (res.ok) {
      sent++;
      await sql`
        UPDATE marketing_campaign_outreach_recipients
        SET status = 'sent', sent_at = now(), message_id = ${res.messageId ?? null}
        WHERE id = ${r.id}
      `;
      // CRM sync — best-effort, never fails the send loop.
      try {
        await syncProspectFromOutreach({
          email: r.email,
          first_name: r.first_name,
          last_name: r.last_name,
          company: r.company,
          source: input.sourceLabel ?? 'outreach',
        });
      } catch (err) {
        console.warn('[dispatchOutreach] prospect sync failed for', r.email, err);
      }
    } else {
      failed++;
      await sql`
        UPDATE marketing_campaign_outreach_recipients
        SET status = 'failed', error = ${res.error ?? 'unknown'}
        WHERE id = ${r.id}
      `;
    }
    // Tiny pacing buffer (~150ms) to stay under 10 req/sec.
    await new Promise((res2) => setTimeout(res2, 120));
  }

  const totalRows = (await sql`
    SELECT count(*)::int AS total FROM marketing_campaign_outreach_recipients
    WHERE outreach_id = ${input.outreachId}
  `) as unknown as Array<{ total: number }>;
  const total = totalRows[0]?.total ?? sent + failed;

  // Update parent outreach with final status + aggregated stats.
  const newStatus = failed > 0 && sent === 0 ? 'failed' : 'sent';
  await sql`
    UPDATE marketing_campaign_outreach
    SET status = ${newStatus},
        sent_at = COALESCE(sent_at, now()),
        recipient_count = ${total},
        stats = jsonb_build_object('sent', ${sent}::int, 'failed', ${failed}::int, 'total', ${total}::int)
    WHERE id = ${input.outreachId}
  `;

  return { sent, failed, total };
}
