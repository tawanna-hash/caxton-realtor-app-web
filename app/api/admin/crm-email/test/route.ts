// app/api/admin/crm-email/test/route.ts
//
// POST — send a single test email to an arbitrary address (usually the
// admin's own inbox) with the composer's current subject/body/tokens.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { sendOneRecipient } from '@/lib/marketing-email';
import {
  resolveAttachmentsForSend,
  allAttachmentsFailed,
  summarizeAttachmentFailures,
} from '@/lib/server/marketing-attachments';
import { logger } from '@/lib/server/logger';
import { appendLinkButton } from '../_shared';

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
}).strict();

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = testSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', detail: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Resolve Blob attachments into inline links + real Resend attachments
  // (URL passthrough). Fail loud if files were attached but none deliver.
  const resolved = await resolveAttachmentsForSend(input.attachments ?? null);
  if (allAttachmentsFailed(resolved)) {
    const detail = summarizeAttachmentFailures(resolved);
    logger.error(
      { to: input.to, attempted: resolved.attempted, failures: resolved.failures },
      '[crm-email/test] all attachments failed — aborting test send',
    );
    return NextResponse.json({ error: 'attachment_failed', detail }, { status: 502 });
  }

  // Append the manual attachment-link button if configured.
  const body = appendLinkButton(input.body, input.attachment_link_url, input.attachment_link_label);

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
      body,
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
      attachments: resolved.resendAttachments.length > 0 ? resolved.resendAttachments : undefined,
      attachmentLinks: resolved.links.length > 0 ? resolved.links : undefined,
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
}
