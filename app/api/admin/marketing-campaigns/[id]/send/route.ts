// app/api/admin/marketing-campaigns/[id]/send/route.ts
//
// POST — Create an outreach under the campaign and either send it immediately
// (mode=send_now) or persist as status=scheduled for the cron to pick up.
//
// Materializes the recipient ledger up-front so the count is final and the
// audience snapshot is preserved against future edits.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { parseJson } from '@/lib/server/schemas/_common';
import { getSql, ensureSchema } from '@/lib/db';
import { sendOutreachSchema } from '@/lib/server/schemas/marketing-outreach';
import { materializeAudience, insertRecipientsLedger, dispatchOutreach } from '@/lib/server/marketing-send';
import { fetchBlobAttachments } from '@/lib/server/blob-fetch';
import { getMediaKitStats, formatStat } from '@/lib/media-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withErrorHandling(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid id');

  const input = await parseJson(req as unknown as Request, sendOutreachSchema);
  await ensureSchema();
  const sql = getSql();

  // Confirm the campaign exists; pull publication so we pick the right brand.
  const campRows = (await sql`
    SELECT id, publication FROM marketing_campaigns WHERE id = ${id}
  `) as unknown as Array<{ id: string; publication: string | null }>;
  if (campRows.length === 0) throw new ApiError(404, 'campaign not found');
  const camp = campRows[0];

  // Build the recipient list NOW so we can persist the snapshot.
  const seeds = await materializeAudience({
    sources: input.sources,
    advertiserFilter: input.advertiser_filter,
    subscriberFilter: input.subscriber_filter,
    manualEmails: input.manual_emails,
  });
  if (seeds.length === 0) throw new ApiError(422, 'no recipients matched');

  const isRecurring = !!input.recurrence;
  const initialStatus = input.mode === 'schedule' ? 'scheduled' : 'sending';
  // Recurring parents fire off `next_run_at`; the first fire is the scheduled
  // datetime. One-shots leave next_run_at NULL and rely on scheduled_for.
  const nextRunAt = isRecurring ? (input.scheduled_for ?? null) : null;
  const replyToAddresses = input.reply_to_addresses ?? [];

  const created = (await sql`
    INSERT INTO marketing_campaign_outreach (
      campaign_id, channel, subject, body, status, scheduled_for,
      recipient_ids, recipient_count, audience_sources, subscriber_ids, manual_emails,
      from_name, reply_to, preview_text, created_by,
      recurrence_interval_days, recurrence_until, next_run_at,
      advertiser_filter, subscriber_filter, attachments, reply_to_addresses
    ) VALUES (
      ${id}, 'email',
      ${input.subject}, ${input.body},
      ${initialStatus},
      ${input.scheduled_for ?? null},
      ${JSON.stringify(seeds.filter(s => s.recipient_type === 'advertiser').map(s => s.recipient_id))}::jsonb,
      ${seeds.length},
      ${JSON.stringify(input.sources)}::jsonb,
      ${JSON.stringify(seeds.filter(s => s.recipient_type === 'subscriber').map(s => s.recipient_id))}::jsonb,
      ${JSON.stringify(seeds.filter(s => s.recipient_type === 'manual').map(s => s.email))}::jsonb,
      ${input.from_name ?? null},
      ${input.reply_to ?? null},
      ${input.preview_text ?? null},
      ${admin.email ?? null},
      ${input.recurrence?.interval_days ?? null},
      ${input.recurrence?.until ?? null},
      ${nextRunAt},
      ${input.advertiser_filter ? JSON.stringify(input.advertiser_filter) : null}::jsonb,
      ${input.subscriber_filter ? JSON.stringify(input.subscriber_filter) : null}::jsonb,
      ${JSON.stringify(input.attachments ?? [])}::jsonb,
      ${JSON.stringify(replyToAddresses)}::jsonb
    ) RETURNING *
  `) as unknown as Array<{ id: string }>;
  const outreach = created[0];

  // A recurring parent is a template — it never sends directly. Each fire
  // spawns a child with its own freshly-materialized ledger, so we skip the
  // parent ledger here. One-shots (and immediate sends) get their ledger now.
  if (!isRecurring) {
    await insertRecipientsLedger(outreach.id, seeds);
  }

  // If scheduling for later, we're done — cron will pick it up.
  if (input.mode === 'schedule') {
    return NextResponse.json({
      outreach_id: outreach.id,
      status: 'scheduled',
      scheduled_for: input.scheduled_for,
      recurrence_interval_days: input.recurrence?.interval_days ?? null,
      recurrence_until: input.recurrence?.until ?? null,
      recipient_count: seeds.length,
    });
  }

  // Otherwise, dispatch now. We do this synchronously so the API returns
  // accurate counts. Resend pacing is built into dispatchOutreach.
  // marketing_campaigns.publication is stored as 'austin' | 'san_antonio' | 'both'.
  // Map to the brand the renderer expects.
  const brand: 'realtyline' | 'newsline' | 'caxton' =
    camp.publication === 'san_antonio' ? 'newsline'
    : camp.publication === 'both' ? 'caxton'
    : 'realtyline';

  const { attachments: resendAttachments } = await fetchBlobAttachments(input.attachments);
  const stats = await getMediaKitStats(sql as never);
  const result = await dispatchOutreach({
    outreachId: outreach.id,
      sourceLabel: Array.isArray(input.sources) ? input.sources.join("+") : "outreach",
    subject: input.subject,
    body: input.body,
    previewText: input.preview_text,
    fromName: input.from_name,
    replyTo: replyToAddresses.length > 0 ? replyToAddresses : input.reply_to,
    repName: admin.email ?? null,
    brand,
    attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    extraTokens: {
      print_subscribers: formatStat(stats.print_subscribers),
      email_subscribers: formatStat(stats.email_subscribers),
    },
  });

  return NextResponse.json({
    outreach_id: outreach.id,
    status: result.failed > 0 && result.sent === 0 ? 'failed' : 'sent',
    sent: result.sent,
    failed: result.failed,
    total: result.total,
  });
});
