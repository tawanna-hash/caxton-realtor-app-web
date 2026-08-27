import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  dispatchOutreach,
  insertRecipientsLedger,
  type RecipientSeed,
} from '@/lib/server/marketing-send';
import { resolveCrmAudience, type CrmAudienceFilter } from '../../_shared';
import { resolveAttachments, type AttachmentRef } from '@/lib/server/email-attachments';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const sql = getSql();
  const { id } = await params;

  const origRows = (await sql`
    SELECT * FROM marketing_campaign_outreach WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as Array<Record<string, unknown>>;
  if (origRows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const orig = origRows[0];

  const snapshot = orig.audience_snapshot as {
    filter?: CrmAudienceFilter;
    crmFilter?: CrmAudienceFilter;
    manualEmails?: string[];
  } | null;
  const filter: CrmAudienceFilter = snapshot?.crmFilter
    ?? snapshot?.filter
    ?? { ids: (orig.recipient_ids as number[]) ?? [] };
  const rows = await resolveCrmAudience(filter);
  const storedManualEmails = Array.isArray(snapshot?.manualEmails)
    ? snapshot.manualEmails
    : (Array.isArray(orig.manual_emails) ? orig.manual_emails as string[] : []);
  const seen = new Set<string>();
  const seeds: RecipientSeed[] = [];
  for (const r of rows) {
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
  for (const raw of storedManualEmails) {
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
    return NextResponse.json({ error: 'no_recipients' }, { status: 400 });
  }

  const inserted = (await sql`
    INSERT INTO marketing_campaign_outreach (
      campaign_id, channel, subject, body, status,
      recipient_ids, recipient_count, audience_sources, subscriber_ids, manual_emails,
      from_name, reply_to, reply_to_list, preview_text,
      attachments, attachment_link_url, attachment_link_label,
      audience_snapshot,
      created_by
    ) VALUES (
      ${orig.campaign_id},
      'email',
      ${orig.subject},
      ${orig.body},
      'sending',
      ${JSON.stringify(seeds.flatMap((seed) => seed.recipient_id == null ? [] : [seed.recipient_id]))}::jsonb,
      ${seeds.length},
      ${JSON.stringify([
        ...(seeds.some((seed) => seed.recipient_type === 'advertiser') ? ['advertisers'] : []),
        ...(seeds.some((seed) => seed.recipient_type === 'manual') ? ['manual'] : []),
      ])}::jsonb,
      ${JSON.stringify([])}::jsonb,
      ${JSON.stringify(seeds.filter((seed) => seed.recipient_type === 'manual').map((seed) => seed.email))}::jsonb,
      ${orig.from_name},
      ${orig.reply_to},
      ${JSON.stringify(orig.reply_to_list ?? [])}::jsonb,
      ${orig.preview_text},
      ${JSON.stringify(orig.attachments ?? [])}::jsonb,
      ${orig.attachment_link_url},
      ${orig.attachment_link_label},
      ${(orig.audience_snapshot ?? null) as unknown as string},
      ${(admin as { email?: string; id?: string }).email ?? (admin as { id?: string }).id ?? 'admin'}
    ) RETURNING id
  `) as unknown as Array<{ id: string }>;
  const newId = inserted[0].id;

  await insertRecipientsLedger(newId, seeds);

  const origAttachments = (orig.attachments as AttachmentRef[] | undefined) ?? undefined;
  const attachments = await resolveAttachments(origAttachments);
  const replyToList = Array.isArray(orig.reply_to_list) ? (orig.reply_to_list as string[]) : null;

  const result = await dispatchOutreach({
    outreachId: newId,
    subject: String(orig.subject ?? ''),
    body: String(orig.body ?? ''),
    previewText: (orig.preview_text as string | null) ?? undefined,
    fromName: (orig.from_name as string | null) ?? undefined,
    replyTo: replyToList ?? ((orig.reply_to as string | null) ?? undefined),
    attachments: attachments.length > 0 ? attachments : undefined,
    attachmentLinks: origAttachments && origAttachments.length > 0
      ? origAttachments
          .filter((a): a is AttachmentRef & { url: string } => typeof a.url === 'string' && a.url.length > 0)
          .map((a) => ({ filename: a.filename, url: a.url }))
      : undefined,
    sourceLabel: 'crm-resend',
  });

  return NextResponse.json({ ok: true, outreach_id: newId, ...result });
});
