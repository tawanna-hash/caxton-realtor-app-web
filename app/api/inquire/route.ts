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
import { APP_AD_SLOTS } from '@/lib/media-kit';

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

  // Auto-reply to submitter: thank you + rate card + CTA to self-serve checkout.
  // Best-effort — never block the inquiry response on this.
  try {
    const slotInfo = data.slot ? APP_AD_SLOTS.find((s) => s.slug === data.slot) : null;
    const checkoutUrl = slotInfo
      ? `https://realtynewsnow.app/advertise/checkout/${slotInfo.slug}?pub=${data.pub}`
      : 'https://realtynewsnow.app/advertise';

    const ratesRow = slotInfo
      ? (() => {
          const unit = slotInfo.pricingUnit ?? 'week';
          const wkSingle = `$${slotInfo.weeklySingle}/${unit === 'per send' ? 'send' : unit === 'per push' ? 'push' : 'wk'} single pub`;
          const wkBoth = `$${slotInfo.weeklyBoth}/${unit === 'per send' ? 'send' : unit === 'per push' ? 'push' : 'wk'} both pubs`;
          const mo =
            slotInfo.monthlySingle && slotInfo.monthlyBoth
              ? `<br/>$${slotInfo.monthlySingle}/mo single · $${slotInfo.monthlyBoth}/mo both`
              : '';
          return `${wkSingle} · ${wkBoth}${mo}`;
        })()
      : '';

    const replyHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;padding:24px;color:#1a2a44;">
        <h2 style="margin:0 0 16px 0;color:#1a2a44;">Thanks for reaching out, ${escapeHtml(data.name.split(' ')[0] ?? data.name)}.</h2>
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 20px 0;">
          We received your inquiry${data.slot_label ? ` about <strong>${escapeHtml(data.slot_label)}</strong>` : ''} and will follow up personally within one business day.
        </p>
        ${
          slotInfo
            ? `
        <div style="background:#f6f8fa;border:1px solid #e1e6ee;border-radius:8px;padding:16px;margin:0 0 24px 0;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(slotInfo.tier)} placement</p>
          <p style="margin:0 0 8px 0;font-size:17px;font-weight:600;color:#1a2a44;">${escapeHtml(slotInfo.name)}</p>
          <p style="margin:0 0 8px 0;font-size:14px;color:#444;">${ratesRow}</p>
          <p style="margin:0 0 4px 0;font-size:13px;color:#666;"><strong>Specs:</strong> ${escapeHtml(slotInfo.sizes)}</p>
          <p style="margin:0;font-size:13px;color:#666;"><strong>Placement:</strong> ${escapeHtml(slotInfo.notes)}</p>
        </div>
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 16px 0;">
          Ready to book yourself? You can choose dates, upload creative, accept terms, and pay by card in under five minutes:
        </p>
        <p style="margin:0 0 28px 0;">
          <a href="${checkoutUrl}" style="display:inline-block;background:#1a2a44;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
            Book this placement
          </a>
        </p>`
            : `
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 16px 0;">
          See our full rate card and book any of our 17 placements directly:
        </p>
        <p style="margin:0 0 28px 0;">
          <a href="https://realtynewsnow.app/advertise" style="display:inline-block;background:#1a2a44;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
            View rate card
          </a>
        </p>`
        }
        <p style="font-size:13px;color:#999;margin:24px 0 0 0;border-top:1px solid #eee;padding-top:16px;">
          Questions? Just reply to this email.<br/>
          — The RealtyLine Austin & Newsline San Antonio team
        </p>
      </div>
    `;

    await sendEmail({
      to: data.email,
      subject: slotInfo ? `Your ${slotInfo.name} inquiry — rate sheet & booking link` : 'Thanks for your ad inquiry',
      html: replyHtml,
      replyTo: recipient,
    });
  } catch (e) {
    console.warn('[inquire] auto-reply failed (non-fatal):', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
