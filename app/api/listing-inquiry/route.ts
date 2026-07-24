// app/api/listing-inquiry/route.ts
//
// Public endpoint for "Request more information" submissions from the
// inventory detail pages (/inventory/[id]). Mirrors /api/inquire but is
// listing-scoped: it emails the RNN team a lead and fires a PostHog event.
//
// Body:
//   { listing_id, listing_title, builder_name, first_name, last_name,
//     email, phone?, message, is_realtor?, website? }
//
// `website` is a honeypot. If non-empty the request is dropped silently
// with a 200 so the bot believes it succeeded.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { escapeHtml, BRAND } from '@/lib/server/email/html';
import { getBuilderSalesEmail, DEFAULT_INQUIRY_TO } from '@/lib/builder-contacts';

export const runtime = 'nodejs';

const schema = z.object({
  listing_id: z.union([z.number(), z.string()]).optional(),
  listing_title: z.string().trim().max(300).optional().default(''),
  builder_name: z.string().trim().max(200).optional().default(''),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional().default(''),
  message: z.string().trim().max(5000).optional().default(''),
  is_realtor: z.boolean().optional().default(false),
  website: z.string().optional().default(''), // honeypot
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const d = parsed.data;

  // Honeypot trip — silently succeed without sending email.
  if (d.website.trim() !== '') {
    console.warn('[listing-inquiry] honeypot tripped', {
      ip: req.headers.get('x-forwarded-for') ?? 'unknown',
    });
    return NextResponse.json({ ok: true });
  }

  const listingUrl =
    req.headers.get('referer') ||
    (d.listing_id ? `https://realtynewsnow.app/inventory/${d.listing_id}` : '');

  const fullName = `${d.first_name} ${d.last_name}`.trim();
  const realtorTag = d.is_realtor ? 'Yes' : 'No';

  const subject = `New listing inquiry: ${d.listing_title || 'inventory #' + d.listing_id}`;
  const html = `
<table role="presentation" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937;font-size:15px;line-height:1.6;">
  <tr><td>
    <h2 style="color:${BRAND.primary};margin:0 0 16px;">New listing inquiry</h2>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:4px 0;color:#6b7280;width:130px;vertical-align:top;">Listing</td><td style="padding:4px 0;"><strong>${escapeHtml(d.listing_title)}</strong>${d.listing_id ? ` (#${escapeHtml(String(d.listing_id))})` : ''}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Builder</td><td style="padding:4px 0;">${escapeHtml(d.builder_name)}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Name</td><td style="padding:4px 0;">${escapeHtml(fullName)}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Email</td><td style="padding:4px 0;"><a href="mailto:${encodeURIComponent(d.email)}" style="color:${BRAND.primary};">${escapeHtml(d.email)}</a></td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Phone</td><td style="padding:4px 0;">${d.phone ? `<a href="tel:${encodeURIComponent(d.phone)}" style="color:${BRAND.primary};">${escapeHtml(d.phone)}</a>` : '—'}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Realtor?</td><td style="padding:4px 0;">${realtorTag}</td></tr>
    </table>
    ${d.message ? `<h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">Message</h3><p style="margin:0;white-space:pre-wrap;">${escapeHtml(d.message)}</p>` : ''}
    ${listingUrl ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(listingUrl)}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">View listing</a></p>` : ''}
  </td></tr>
</table>`;

  // Forward to the builder's sales team when we have one on file;
  // CC the default RNN inbox so the team stays in the loop and no
  // lead is ever lost to an unmonitored address.
  const builderEmail = getBuilderSalesEmail(d.builder_name);
  const to = builderEmail ?? DEFAULT_INQUIRY_TO;
  const cc = builderEmail ? [DEFAULT_INQUIRY_TO] : undefined;

  // Fire analytics first so a Resend outage doesn't lose the signal.
  captureServerEvent('inventory_inquiry_submitted', d.email || 'server', {
    listing_id: d.listing_id ?? null,
    listing_title: d.listing_title,
    builder_name: d.builder_name,
    is_realtor: d.is_realtor,
    source_url: listingUrl,
    forwarded_to_builder: !!builderEmail,
    recipient: builderEmail ? 'builder' : 'fallback',
  });

  const result = await sendEmail({
    to,
    cc,
    subject,
    html,
    replyTo: d.email,
  });

  await flushServerEvents();

  if (!result.ok) {
    console.error('[listing-inquiry] sendEmail failed', result.error);
    return NextResponse.json({ error: 'send_failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
