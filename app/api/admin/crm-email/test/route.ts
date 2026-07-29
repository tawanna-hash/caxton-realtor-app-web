// app/api/admin/crm-email/test/route.ts
//
// POST — send a single test email to an arbitrary address (usually the
// admin's own inbox) with the composer's current subject/body/tokens.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { sendOneRecipient } from '@/lib/marketing-email';
import { resolveAttachments, appendAttachmentLinkButton, type AttachmentRef } from '@/lib/server/email-attachments';
import { appendSignature } from '@/lib/email/signature';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const testSchema = z.object({
  to: z.string().regex(emailRe),
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(200_000),
  from_name: z.string().trim().max(120).optional(),
  reply_to: z.string().regex(emailRe).optional(),
  reply_to_list: z.array(z.string().regex(emailRe)).max(10).optional(),
  preview_text: z.string().trim().max(150).optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    url: z.string().url(),
    content_type: z.string().optional(),
  })).max(20).optional(),
  attachment_link_url: z.string().url().max(2000).optional(),
  attachment_link_label: z.string().trim().max(120).optional(),
  publication_scope: z.string().max(60).default('all'),
  include_signature: z.boolean().default(true),
}).strict();

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = testSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', detail: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Append the attachment-link button (shared helper — matches prod send).
  const body = appendAttachmentLinkButton(
    input.body,
    input.attachment_link_url,
    input.attachment_link_label,
  );
  const bodyClean = body.replace(/<!--\s*signature-here\s*-->/g, '');
  const bodyFinal = appendSignature(bodyClean, { skip: !input.include_signature });

  // Fetch each attachment URL and base64-encode for Resend.
  const attachments = await resolveAttachments(
    input.attachments as AttachmentRef[] | undefined,
  );

  const replyToFinal = input.reply_to_list && input.reply_to_list.length > 0
    ? input.reply_to_list
    : input.reply_to;

  const brand: 'realtyline' | 'newsline' | 'caxton' | undefined =
    input.publication_scope === 'realtyline' ? 'realtyline'
    : input.publication_scope === 'newsline' ? 'newsline'
    : input.publication_scope === 'caxton'   ? 'caxton'
    : undefined;

  const from = input.from_name
    ? `${input.from_name} <${(process.env.EMAIL_FROM ?? 'hello@myrealtyline.com').replace(/^.*<|>$/g, '')}>`
    : undefined;

  try {
    const res = await sendOneRecipient({
      subject: `[TEST] ${input.subject}`,
      body: bodyFinal,
      previewText: input.preview_text,
      recipient: {
        id: 'test-preview',
        email: input.to,
        first_name: 'Test',
        last_name: 'Recipient',
        company: null,
        unsub_token: null,
      },
      repName: input.from_name ?? null,
      brand,
      from,
      replyTo: replyToFinal,
      attachments: attachments.length > 0 ? attachments : undefined,
      attachmentLinks: input.attachments && input.attachments.length > 0
        ? input.attachments.map((a) => ({ filename: a.filename, url: a.url }))
        : undefined,
    });
    if (!res.ok) {
      return NextResponse.json({
        error: 'test send failed',
        detail: (res as { error?: string }).error ?? 'send returned not ok',
      }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      error: 'test send failed',
      detail: err instanceof Error ? err.message : 'error',
    }, { status: 500 });
  }
});
