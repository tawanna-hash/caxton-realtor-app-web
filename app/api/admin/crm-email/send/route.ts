// app/api/admin/crm-email/send/route.ts
//
// POST — send now (mode='send_now') or schedule for later (mode='schedule')
// against a CRM audience filter. Reuses the existing dispatch pipeline
// (dispatchOutreach + insertRecipientsLedger + cron for recurring).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  dispatchOutreach,
  insertRecipientsLedger,
  type RecipientSeed,
} from '@/lib/server/marketing-send';
import { resolveCrmAudience, ensureCrmOutreachCampaign, type CrmAudienceFilter } from '../_shared';
import { resolveAttachments, appendAttachmentLinkButton, type AttachmentRef } from '@/lib/server/email-attachments';
import { appendSignature } from '@/lib/email/signature';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const filterSchema = z.object({
  query: z.string().max(200).optional(),
  status: z.array(z.enum(['prospect', 'advertiser', 'archived'])).optional(),
  type: z.array(z.enum(['advertiser', 'client', 'prospect', 'mailing'])).optional(),
  publication: z.array(z.string()).optional(),
  tag: z.string().max(60).optional(),
  ids: z.array(z.number().int().positive()).max(100000).optional(),
}).partial();

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  url: z.string().url().max(2000),
  content_type: z.string().trim().max(200).optional(),
});

const sendSchema = z.object({
  filter: filterSchema,
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(200_000),
  from_name: z.string().trim().max(120).optional(),
  reply_to: z.string().regex(emailRe).optional(),
  reply_to_list: z.array(z.string().regex(emailRe)).max(10).optional(),
  preview_text: z.string().trim().max(150).optional(),
  attachments: z.array(attachmentSchema).max(20).optional(),
  attachment_link_url: z.string().url().max(2000).optional(),
  attachment_link_label: z.string().trim().max(120).optional(),
  publication_scope: z.string().max(60).default('all'),
  include_signature: z.boolean().default(true),
  mode: z.enum(['send_now', 'schedule']).default('send_now'),
  scheduled_for: z.string().datetime({ offset: true }).optional(),
  recurrence_interval_days: z.number().int().positive().max(365).optional(),
  recurrence_until: z.string().datetime({ offset: true }).optional(),
  manual_emails: z.array(z.string().regex(emailRe)).max(10000).optional(),
}).strict().refine(
  (v) => v.mode !== 'schedule' || !!v.scheduled_for,
  { message: 'scheduled_for required when mode=schedule', path: ['scheduled_for'] },
);

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = sendSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', detail: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Signature + attachment-link applied BEFORE persistence so scheduled sends
  // replay the exact same rendered body via the cron worker.
  const bodyWithLinkEarly = appendAttachmentLinkButton(
    input.body,
    input.attachment_link_url,
    input.attachment_link_label,
  );
  const bodyClean = bodyWithLinkEarly.replace(/<!--\s*signature-here\s*-->/g, '');
  const bodyFinal = appendSignature(bodyClean, { skip: !input.include_signature });

  await ensureSchema();
  const sql = getSql();

  // Materialize the audience from the filter.
  const audience = await resolveCrmAudience(input.filter as CrmAudienceFilter);
  const seen = new Set<string>();
  const seeds: RecipientSeed[] = [];
  for (const r of audience) {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    seeds.push({
      recipient_type: 'advertiser',
      recipient_id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      company: r.company,
    });
  }
  for (const raw of input.manual_emails ?? []) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!key || seen.has(key)) continue;
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
  if (seeds.length === 0) {
    return NextResponse.json({ error: 'no recipients matched' }, { status: 422 });
  }

  // Ensure a synthetic campaign row (FK requirement).
  const campaignId = await ensureCrmOutreachCampaign(input.publication_scope);

  const initialStatus = input.mode === 'schedule' ? 'scheduled' : 'sending';
  const created = (await sql`
    INSERT INTO marketing_campaign_outreach (
      campaign_id, channel, subject, body, status, scheduled_for,
      recipient_ids, recipient_count, audience_sources, subscriber_ids, manual_emails,
      from_name, reply_to, preview_text,
      recurrence_interval_days, recurrence_until,
      audience_snapshot, reply_to_list,
      attachments, attachment_link_url, attachment_link_label,
      created_by
    ) VALUES (
      ${campaignId}, 'email',
      ${input.subject}, ${bodyFinal},
      ${initialStatus},
      ${input.scheduled_for ?? null},
      ${JSON.stringify(seeds.flatMap((s) => s.recipient_id == null ? [] : [s.recipient_id]))}::jsonb,
      ${seeds.length},
      ${JSON.stringify([
        ...(seeds.some((s) => s.recipient_type === 'advertiser') ? ['advertisers'] : []),
        ...(seeds.some((s) => s.recipient_type === 'manual') ? ['manual'] : []),
      ])}::jsonb,
      ${JSON.stringify([])}::jsonb,
      ${JSON.stringify(seeds.filter((s) => s.recipient_type === 'manual').map((s) => s.email))}::jsonb,
      ${input.from_name ?? null},
      ${input.reply_to ?? null},
      ${input.preview_text ?? null},
      ${input.recurrence_interval_days ?? null},
      ${input.recurrence_until ?? null},
      ${JSON.stringify({
        sources: [
          ...(seeds.some((s) => s.recipient_type === 'advertiser') ? ['advertisers'] : []),
          ...(seeds.some((s) => s.recipient_type === 'manual') ? ['manual'] : []),
        ],
        crmFilter: input.filter,
        manualEmails: seeds.filter((s) => s.recipient_type === 'manual').map((s) => s.email),
        publicationScope: input.publication_scope,
      })}::jsonb,
      ${input.reply_to_list ? JSON.stringify(input.reply_to_list) : null}::jsonb,
      ${input.attachments ? JSON.stringify(input.attachments) : null}::jsonb,
      ${input.attachment_link_url ?? null},
      ${input.attachment_link_label ?? null},
      ${admin.email ?? null}
    ) RETURNING id
  `) as unknown as Array<{ id: string }>;
  const outreachId = created[0].id;

  await insertRecipientsLedger(outreachId, seeds);

  if (input.mode === 'schedule') {
    return NextResponse.json({
      outreach_id: outreachId,
      status: 'scheduled',
      scheduled_for: input.scheduled_for,
      recipient_count: seeds.length,
    });
  }

  // Send now — dispatch inline.
  const replyToFinal = input.reply_to_list && input.reply_to_list.length > 0
    ? input.reply_to_list
    : input.reply_to;

  const brand: 'realtyline' | 'newsline' | 'caxton' | undefined =
    input.publication_scope === 'realtyline' ? 'realtyline'
    : input.publication_scope === 'newsline' ? 'newsline'
    : input.publication_scope === 'caxton'   ? 'caxton'
    : undefined;

  // Prepare attachments (attachment link button + signature already applied above)
  const attachments = await resolveAttachments(
    input.attachments as AttachmentRef[] | undefined,
  );

  const result = await dispatchOutreach({
    outreachId,
    subject: input.subject,
    body: bodyFinal,
    fromName: input.from_name,
    replyTo: replyToFinal,
    previewText: input.preview_text,
    brand,
    attachments: attachments.length > 0 ? attachments : undefined,
    attachmentLinks: input.attachments && input.attachments.length > 0
      ? input.attachments.map((a) => ({ filename: a.filename, url: a.url }))
      : undefined,
    sourceLabel: 'crm_composer',
  });

  return NextResponse.json({
    outreach_id: outreachId,
    status: 'sent',
    total: result.total,
    sent: result.sent,
    failed: result.failed,
  });
});
