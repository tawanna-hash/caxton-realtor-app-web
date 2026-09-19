import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import {
  createReferralNetworkApplication,
  REFERRAL_PROVIDER_CATEGORIES,
  type ReferralProviderCategory,
} from '@/lib/server/referral-network-applications';

export const runtime = 'nodejs';

const submittedIps = new Map<string, number>();
const THROTTLE_MS = 10 * 60 * 1000;

const applicationSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(7).max(50),
  website: z.string().trim().max(500).optional().default(''),
  categories: z.array(z.enum(REFERRAL_PROVIDER_CATEGORIES)).min(1).max(4),
  serviceAreas: z.string().trim().min(2).max(1000),
  licenseNumber: z.string().trim().max(200).optional().default(''),
  licenseState: z.string().trim().max(100).optional().default(''),
  licenseExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).default(''),
  licenseVerificationUrl: z.string().trim().url().max(500).optional().or(z.literal('')).default(''),
  insuranceCarrier: z.string().trim().max(200).optional().default(''),
  insuranceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).default(''),
  coverageNotes: z.string().trim().max(2000).optional().default(''),
  message: z.string().trim().max(3000).optional().default(''),
  consent: z.literal(true),
  websiteTrap: z.string().max(200).optional().default(''),
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] ?? character));
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Please check the form and try again.' }, { status: 400 });
  }

  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please complete the required fields.' }, { status: 400 });
  }
  const data = parsed.data;
  if (data.websiteTrap) return NextResponse.json({ ok: true });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const lastSubmitted = submittedIps.get(ip) ?? 0;
  if (now - lastSubmitted < THROTTLE_MS) {
    return NextResponse.json(
      { error: 'We received a recent application from this connection. Please try again shortly.' },
      { status: 429 },
    );
  }

  try {
    const application = await createReferralNetworkApplication({
      companyName: data.companyName,
      contactName: data.contactName,
      email: data.email,
      phone: data.phone,
      website: data.website,
      categories: data.categories as ReferralProviderCategory[],
      serviceAreas: data.serviceAreas,
      licenseNumber: data.licenseNumber,
      licenseState: data.licenseState,
      licenseExpiresOn: data.licenseExpiresOn,
      licenseVerificationUrl: data.licenseVerificationUrl,
      insuranceCarrier: data.insuranceCarrier,
      insuranceExpiresOn: data.insuranceExpiresOn,
      coverageNotes: data.coverageNotes,
      message: data.message,
      sourceUrl: req.headers.get('referer'),
      ip,
      userAgent: req.headers.get('user-agent'),
    });
    submittedIps.set(ip, now);

    const recipient = process.env.REFERRAL_NETWORK_TO
      ?? process.env.ADS_INQUIRY_TO
      ?? 'info@myrealtyline.com';
    const notification = await sendEmail({
      to: recipient,
      subject: `[Referral Network] Application from ${data.companyName}`,
      replyTo: data.email,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;padding:24px;color:#1e293b">
          <p style="font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#7059A8;margin:0 0 10px">Referral Network application</p>
          <h1 style="font-size:24px;color:#301D5D;margin:0 0 20px">${escapeHtml(data.companyName)}</h1>
          <p style="margin:0 0 18px"><a href="https://realtynewsnow.app/admin/referral-network" style="color:#301D5D;font-weight:700">Review application #${application.id} in admin</a></p>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            <tr><td style="padding:7px 12px 7px 0;color:#64748b;width:140px">Contact</td><td style="padding:7px 0">${escapeHtml(data.contactName)}</td></tr>
            <tr><td style="padding:7px 12px 7px 0;color:#64748b">Email</td><td style="padding:7px 0"><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>
            <tr><td style="padding:7px 12px 7px 0;color:#64748b">Phone</td><td style="padding:7px 0">${escapeHtml(data.phone)}</td></tr>
            <tr><td style="padding:7px 12px 7px 0;color:#64748b">Services</td><td style="padding:7px 0">${escapeHtml(data.categories.join(', '))}</td></tr>
            <tr><td style="padding:7px 12px 7px 0;color:#64748b">Service areas</td><td style="padding:7px 0">${escapeHtml(data.serviceAreas)}</td></tr>
          </table>
        </div>
      `,
    });
    if (!notification.ok) {
      console.error('[referral-network] application saved but notification failed', notification.error);
    }

    return NextResponse.json({ ok: true, applicationId: application.id }, { status: 201 });
  } catch (error) {
    console.error('[referral-network] application failed', error);
    return NextResponse.json({ error: 'We could not save your application. Please try again.' }, { status: 500 });
  }
}
