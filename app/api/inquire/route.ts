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
import { isAdChannel, deriveChannelFromSlot, AD_CHANNEL_LABEL, type AdChannel } from '@/lib/ad-channels';
import { insertAdInquiry } from '@/lib/server/ad-inquiries-store';
import { isSlotSoldOut, pickAlternativeSlots } from '@/lib/server/slot-availability';
import { ensureSchema } from '@/lib/db';

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
  // Optional channel — if omitted we derive it from the slot/package id.
  channel: z.enum(['print', 'digital', 'email']).optional(),
  // Optional package id (e.g. 'brand6', 'eblast1') for Print/Email flows.
  package_id: z.string().trim().max(100).optional().default(''),
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

  // Resolve channel: explicit → derived from slot/package id → 'digital'.
  const resolvedChannel: AdChannel =
    (data.channel && isAdChannel(data.channel) && data.channel) ||
    deriveChannelFromSlot(data.slot || data.package_id) ||
    'digital';

  // Persist BEFORE sending email so a Resend outage doesn't lose the lead.
  // Also auto-upserts the contact into the unified CRM (advertisers table)
  // with tag 'ad_inquiry'. Failure is non-fatal — we still email.
  await ensureSchema();
  const inquiryRow = await insertAdInquiry({
    channel: resolvedChannel,
    slot_slug: data.slot || null,
    slot_label: data.slot_label || null,
    publication: data.pub,
    package_id: data.package_id || null,
    name: data.name,
    email: data.email,
    phone: data.phone,
    company: data.company,
    message: data.message,
    source_url: req.headers.get('referer'),
    ip: req.headers.get('x-forwarded-for'),
    user_agent: req.headers.get('user-agent'),
  });

  // Probe slot inventory BEFORE composing either email so the internal
  // team email can flag a sold-out inquiry too. Best-effort.
  const slotInfo = data.slot ? APP_AD_SLOTS.find((s) => s.slug === data.slot) : null;
  let soldOut = false;
  let alternatives: Array<{
    slug: string;
    name: string;
    tier: string;
    weeklySingle: number;
    weeklyBoth: number;
    pricingUnit?: 'per send' | 'per push';
    notes: string;
  }> = [];
  if (slotInfo && resolvedChannel === 'digital') {
    try {
      soldOut = await isSlotSoldOut(slotInfo.slug, data.pub);
      if (soldOut) {
        const picks = await pickAlternativeSlots(slotInfo.slug, data.pub, 3);
        alternatives = picks.map((p) => ({
          slug: p.slug,
          name: p.name,
          tier: p.tier,
          weeklySingle: p.weeklySingle,
          weeklyBoth: p.weeklyBoth,
          pricingUnit: p.pricingUnit,
          notes: p.notes,
        }));
      }
    } catch (e) {
      console.warn('[inquire] sold-out probe failed (non-fatal):', e instanceof Error ? e.message : e);
    }
  }

  const channelLabel = AD_CHANNEL_LABEL[resolvedChannel];
  const subject = data.slot_label
    ? `${soldOut ? '[SOLD OUT] ' : ''}[${channelLabel}] Ad inquiry — ${data.slot_label}`
    : `[${channelLabel}] Ad inquiry from realtynewsnow.app`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; padding: 24px;">
      <h2 style="color: #1a2a44; margin: 0 0 16px 0;">New ad inquiry${soldOut ? ' <span style="color:#b45309;font-size:14px;font-weight:600;">(slot sold out)</span>' : ''}</h2>
      <p style="color: #444; font-size: 14px; margin: 0 0 24px 0;">
        Submitted via realtynewsnow.app${data.slot_label ? ` — ${escapeHtml(data.slot_label)}` : ''}
      </p>
      ${soldOut ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:10px 14px;margin:0 0 16px 0;font-size:13px;color:#9a3412;">Buyer was auto-emailed a sold-out notice with alternative placement suggestions.</div>` : ''}
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Name</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.name)}</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Email</td><td style="padding: 6px 0; font-size: 14px;"><a href="mailto:${escapeHtml(data.email)}" style="color: #1a2a44;">${escapeHtml(data.email)}</a></td></tr>
        ${data.phone ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Phone</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.phone)}</td></tr>` : ''}
        ${data.company ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Company</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.company)}</td></tr>` : ''}
        ${data.slot_label ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Slot</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.slot_label)} <span style="color:#999">(${escapeHtml(data.slot)})</span></td></tr>` : ''}
        <tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Channel</td><td style="padding: 6px 0; font-size: 14px;"><strong>${escapeHtml(channelLabel)}</strong></td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Publication</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.pub)}</td></tr>
        ${data.package_id ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Package</td><td style="padding: 6px 0; font-size: 14px;">${escapeHtml(data.package_id)}</td></tr>` : ''}
        ${inquiryRow ? `<tr><td style="padding: 6px 12px 6px 0; color: #666; font-size: 13px; vertical-align: top; white-space: nowrap;">Inbox</td><td style="padding: 6px 0; font-size: 14px;"><a href="https://realtynewsnow.app/admin/ads/inquiries/${inquiryRow.id}" style="color: #1a2a44;">Open in admin</a></td></tr>` : ''}
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

  // Auto-reply to submitter. When the requested slot is sold out we send a
  // waitlist + alternatives message instead of the standard book-it CTA so
  // the buyer isn't pointed at a checkout they can't complete.
  // Best-effort — never block the inquiry response on this.
  try {
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

    const altCardsHtml = alternatives.length
      ? `
        <p style="font-size:15px;line-height:1.5;color:#333;margin:24px 0 12px 0;">
          A few placements that <strong>are</strong> open right now that you may want to consider:
        </p>
        ${alternatives.map((a) => {
          const unit = a.pricingUnit ?? 'week';
          const u = unit === 'per send' ? 'send' : unit === 'per push' ? 'push' : 'wk';
          const altCheckoutUrl = `https://realtynewsnow.app/advertise/checkout/${a.slug}?pub=${data.pub}`;
          return `
          <div style="background:#f6f8fa;border:1px solid #e1e6ee;border-radius:8px;padding:14px 16px;margin:0 0 10px 0;">
            <p style="margin:0 0 4px 0;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(a.tier)} placement</p>
            <p style="margin:0 0 4px 0;font-size:16px;font-weight:600;color:#1a2a44;">
              <a href="${altCheckoutUrl}" style="color:#1a2a44;text-decoration:none;">${escapeHtml(a.name)}</a>
            </p>
            <p style="margin:0 0 4px 0;font-size:13px;color:#444;">$${a.weeklySingle}/${u} single pub · $${a.weeklyBoth}/${u} both pubs</p>
            <p style="margin:0;font-size:12px;color:#666;">${escapeHtml(a.notes)}</p>
          </div>`;
        }).join('')}
      `
      : '';

    let bodyHtml: string;
    if (soldOut && slotInfo) {
      // Sold-out path: waitlist note + alternatives + checkout CTA.
      // The CTA points at /advertise/digital, which lists every digital
      // placement with live availability and a 'Book this placement'
      // button on each open slot. That way the buyer sees the full
      // inventory (not just the inline-feed slot) and can choose what
      // best fits their campaign.
      const ctaHref = `https://realtynewsnow.app/advertise/digital?pub=${data.pub}`;
      const ctaLabel = 'See all available digital placements';
      bodyHtml = `
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 16px 0;">
          Thanks so much for your interest in <strong>${escapeHtml(slotInfo.name)}</strong>. Heads up — that placement is <strong>fully booked</strong> right now, so we've added you to the waitlist and will reach out the moment it opens up.
        </p>
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 8px 0;">
          In the meantime, we have several other strong placements with similar reach that are available today. Each card below links straight to a self-checkout where you can pick dates, upload creative, and pay by card in under five minutes. Our team will also follow up within one business day.
        </p>
        ${altCardsHtml}
        <p style="margin:24px 0 0 0;">
          <a href="${ctaHref}" style="display:inline-block;background:#1a2a44;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
            ${escapeHtml(ctaLabel)}
          </a>
        </p>`;
    } else if (slotInfo) {
      // Standard path: rate card + book CTA.
      bodyHtml = `
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 20px 0;">
          We received your inquiry about <strong>${escapeHtml(slotInfo.name)}</strong> and will follow up personally within one business day.
        </p>
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
        </p>`;
    } else {
      // No specific slot — generic rate card CTA.
      bodyHtml = `
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 20px 0;">
          We received your inquiry${data.slot_label ? ` about <strong>${escapeHtml(data.slot_label)}</strong>` : ''} and will follow up personally within one business day.
        </p>
        <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 16px 0;">
          See our full rate card and book any of our 17 placements directly:
        </p>
        <p style="margin:0 0 28px 0;">
          <a href="https://realtynewsnow.app/advertise" style="display:inline-block;background:#1a2a44;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
            View rate card
          </a>
        </p>`;
    }

    const replyHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;padding:24px;color:#1a2a44;">
        <h2 style="margin:0 0 16px 0;color:#1a2a44;">Thanks for reaching out, ${escapeHtml(data.name.split(' ')[0] ?? data.name)}.</h2>
        ${bodyHtml}
        <p style="font-size:13px;color:#999;margin:24px 0 0 0;border-top:1px solid #eee;padding-top:16px;">
          Questions? Just reply to this email.<br/>
          — The RealtyLine Austin & Newsline San Antonio team
        </p>
      </div>
    `;

    const replySubject = soldOut && slotInfo
      ? `${slotInfo.name} is fully booked — here are a few alternatives`
      : slotInfo
        ? `Your ${slotInfo.name} inquiry — rate sheet & booking link`
        : 'Thanks for your ad inquiry';

    await sendEmail({
      to: data.email,
      subject: replySubject,
      html: replyHtml,
      replyTo: recipient,
    });
  } catch (e) {
    console.warn('[inquire] auto-reply failed (non-fatal):', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    ok: true,
    messageId: result.messageId,
    inquiryId: inquiryRow?.id ?? null,
    channel: resolvedChannel,
    soldOut,
  });
}
