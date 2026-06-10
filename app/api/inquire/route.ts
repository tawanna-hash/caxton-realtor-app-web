/**
 * /api/inquire  POST
 *
 * Public endpoint for ad-slot inquiries from /advertise/inquire.
 * Emails the ads team via Resend and returns 200 on success.
 *
 * Body:
 *   { name, email, phone?, company?, message, slot?, slot_label?, pub?, website? }
 *
 * `website` is a honeypot field. If non-empty, the request is dropped
 * silently with a 200 so the bot believes it succeeded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

const inquirySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional().default(''),
  company: z.string().trim().max(200).optional().default(''),
  message: z.string().trim().min(1).max(5000),
  slot: z.string().trim().max(100).optional().default(''),
  slot_label: z.string().trim().max(200).optional().default(''),
  pub: z.enum(['realtyline', 'newsline']).optional().default('realtyline'),
  website: z.string().optional().default(''),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Honeypot trip — silently succeed without sending email.
  if (data.website.trim() !== '') {
    console.warn('[inquire] honeypot tripped', {
      ip: req.headers.get('x-forwarded-for') ?? 'unknown',
    });
    return NextResponse.json({ ok: true });
  }

  const subject = data.slot_label
    ? `Ad inquiry — ${data.slot_label}`
    : 'Ad inquiry from realtynewsnow.app';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; padding: 24px;">
      <h2 style="color: #1a2a44; margin: 0 0 16px 0;">New ad inquiry</h2>
      <p style="color: #444; font-size: 14px; margin: 0 0 24px 0;">
        Submitted via realtynewsnow.app${data.slot_label ? ` — ${escapeHtml(data.slot_label)}` : ''}
      </p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Name</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.name)}</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Email</td><td style="padding: 6px 0; font-size: 14px;"><a href="mailto:${escapeHtml(data.email)}" style="color: #1a2a44;">${escapeHtml(data.email)}</a></td></tr>
        ${data.phone ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Phone</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.phone)}</td></tr>` : ''}
        ${data.company ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Company</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.company)}</td></tr>` : ''}
        ${data.slot_label ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Slot</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.slot_label)} <span style="color:#999">(${escapeHtml(data.slot)})</span></td></tr>` : ''}
        <tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Publication</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.pub)}</td></tr>
      </table>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 13px; margin: 0 0 8px 0;">Message:</p>
        <p style="white-space: pre-wrap; font-size: 14px; line-height: 1.5; color: #222; margin: 0;">${escapeHtml(data.message)}</p>
      </div>
    </div>
  `;

  const recipient = process.env.ADS_INQUIRY_TO ?? 'ads@myrealtyline.com';
  const result = await sendEmail({
    to: recipient,
    subject,
    html,
    replyTo: data.email,
  });

  if (!result.ok) {
    console.error('[inquire] send failed:', result.error);
    return NextResponse.json(
      { error: 'send_failed', detail: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
