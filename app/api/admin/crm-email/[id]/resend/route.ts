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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const snapshot = orig.audience_snapshot as { filter?: CrmAudienceFilter } | null;
  const filter: CrmAudienceFilter = snapshot?.filter ?? { ids: (orig.recipient_ids as number[]) ?? [] };
  const rows = await resolveCrmAudience(filter);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'no_recipients' }, { status: 400 });
  }

  const inserted = (await sql`
    INSERT INTO marketing_campaign_outreach (
      campaign_id, channel, subject, body, status,
      recipient_ids, recipient_count,
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
      ${JSON.stringify(rows.map((r) => r.id))}::jsonb,
      ${rows.length},
      ${orig.from_name},
      ${orig.reply_to},
      ${(orig.reply_to_list ?? null) as unknown as string},
      ${orig.preview_text},
      ${(orig.attachments ?? null) as unknown as string},
      ${orig.attachment_link_url},
      ${orig.attachment_link_label},
      ${(orig.audience_snapshot ?? null) as unknown as string},
      ${(admin as { email?: string; id?: string }).email ?? (admin as { id?: string }).id ?? 'admin'}
    ) RETURNING id
  `) as unknown as Array<{ id: string }>;
  const newId = inserted[0].id;

  const seeds: RecipientSeed[] = rows.map((r) => ({
    recipient_type: 'advertiser',
    recipient_id: r.id,
    email: r.email,
    first_name: r.first_name,
    last_name: r.last_name,
    company: r.company,
  }));
  await insertRecipientsLedger(newId, seeds);

  const attachments = await resolveAttachments(orig.attachments as AttachmentRef[] | undefined);
  const replyToList = Array.isArray(orig.reply_to_list) ? (orig.reply_to_list as string[]) : null;

  const result = await dispatchOutreach({
    outreachId: newId,
    subject: String(orig.subject ?? ''),
    body: String(orig.body ?? ''),
    previewText: (orig.preview_text as string | null) ?? null,
    fromName: (orig.from_name as string | null) ?? null,
    replyTo: replyToList ?? ((orig.reply_to as string | null) ?? null),
    repName: (admin as { name?: string; email?: string }).name ?? (admin as { email?: string }).email ?? null,
    attachments: attachments.attachments,
    attachmentLinks: attachments.attachmentLinks,
    sourceLabel: 'crm-resend',
  });

  return NextResponse.json({ ok: true, outreach_id: newId, ...result });
}
