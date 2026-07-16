// app/api/admin/crm-email/test/route.ts
//
// POST — send a single test email to an arbitrary address (usually the
// admin's own inbox) with the composer's current subject/body/tokens.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { sendOneRecipient } from '@/lib/marketing-email';

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

  // Append the attachment-link button if configured.
  let body = input.body;
  if (input.attachment_link_url) {
    const label = input.attachment_link_label || 'Download attachment';
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    body += `<p style="margin:24px 0"><a href="${esc(input.attachment_link_url)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
  }

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
