// lib/email-templates.ts
//
// Pressbook HTML email builders ported to TypeScript.
// Mirrors buildAgreementEmailHtml (pb_index.html line 638)
// and buildRenewalEmailHtml (pb_index.html ~line 670).

import { escapeHtml } from '@/lib/server/email/html';

export interface BrandConfig {
  brandName: string;
  brandColor: string;
  brandLogo?: string;
  websiteUrl?: string;
}

export const REALTYLINE_BRAND: BrandConfig = {
  brandName: 'RealtyLine',
  brandColor: '#D70E17',
  brandLogo: '',
  websiteUrl: 'https://realtynewsnow.app',
};

export interface AgreementNotificationParams {
  brand?: BrandConfig;
  companyName?: string;
  repName?: string;
  adSize?: string;
  adRate?: number | null;
  status?: string;
  message?: string;
  signingLink?: string;
}

export function agreementNotificationEmail(params: AgreementNotificationParams): string {
  const brand = params.brand ?? REALTYLINE_BRAND;
  const websiteUrl = brand.websiteUrl ?? 'https://realtynewsnow.app';
  const advertiserName = params.repName ?? 'Advertiser';
  const greeting = advertiserName ? `Dear ${advertiserName},` : 'Dear Advertiser,';
  const message = params.message ?? (params.signingLink
    ? `Your ${brand.brandName} advertising agreement is ready for review. Click below to open your secure signing portal. If your package hasn't been pre-selected, you'll be able to choose your ad size and publication frequency before signing. Reach out if you have any questions — we're glad to help.`
    : `Thank you for your continued partnership with ${brand.brandName}.`);
  const formattedMessage = message.replace(/\n/g, '<br>');

  const hasDetails = params.companyName || params.adSize || params.adRate != null || params.status;

  const companyRow = params.companyName
    ? `<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Company:</strong> ${params.companyName}</td></tr>`
    : '';
  const adSizeRow = params.adSize
    ? `<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Ad Size:</strong> ${params.adSize}</td></tr>`
    : '';
  const adRateRow = params.adRate != null
    ? `<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Ad Rate:</strong> $${Number(params.adRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/issue</td></tr>`
    : '';
  const statusRow = params.status
    ? `<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Status:</strong> ${params.status}</td></tr>`
    : '';

  const detailsBox = hasDetails
    ? `<tr><td style="padding:0 40px 24px 40px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9f9f9;border:1px solid #e8e8e8;border-radius:4px;border-left:4px solid ${brand.brandColor}"><tr><td style="padding:20px 24px"><p style="margin:0 0 10px 0;font-family:Arial,sans-serif;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.8px">Agreement Details</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${companyRow}${adSizeRow}${adRateRow}${statusRow}</table></td></tr></table></td></tr>`
    : '';

  const ctaButton = params.signingLink
    ? `<tr><td align="center" style="padding:24px 40px"><a href="${params.signingLink}" style="display:inline-block;background:${brand.brandColor};color:#fff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:4px;letter-spacing:.5px">Review &amp; Sign Agreement</a></td></tr>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Agreement Notification</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f4;padding:32px 0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
<tr><td style="background:${brand.brandColor};padding:28px 40px;text-align:center"><h1 style="margin:0;color:#fff;font-family:Arial,sans-serif;font-size:26px;font-weight:bold;letter-spacing:1px">${brand.brandName}</h1></td></tr>
<tr><td style="padding:36px 40px 16px 40px"><p style="margin:0;font-family:Arial,sans-serif;font-size:16px;color:#222">${greeting}</p></td></tr>
${detailsBox}
<tr><td style="padding:0 40px 32px 40px"><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#444;line-height:1.7">${formattedMessage}</p></td></tr>
${ctaButton}
<tr><td style="background:#f4f4f4;border-top:1px solid #e0e0e0;padding:20px 40px;text-align:center">
<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#888">Sent by ${brand.brandName} | <a href="${websiteUrl}" style="color:#888;text-decoration:none">${websiteUrl}</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

export interface RenewalEmailParams {
  brand?: BrandConfig;
  companyName?: string;
  repName?: string;
  expirationDate: string;       // human-readable e.g. "December 31, 2026"
  daysRemaining: number;
  adSize?: string;
  frequency?: string;
  adRate: number;
  signingLink?: string;
  agreementDataUri?: string;
}

export function renewalEmail(params: RenewalEmailParams): string {
  const brand = params.brand ?? REALTYLINE_BRAND;
  const websiteUrl = brand.websiteUrl ?? 'https://realtynewsnow.app';
  const advertiserName = params.repName ?? 'Advertiser';
  const companyName = params.companyName ?? '';
  const daysRemaining = params.daysRemaining;

  const urgencyColor = daysRemaining <= 7 ? '#DC2626' : daysRemaining <= 14 ? '#F0BE39' : '#6B7A99';
  const urgencyText = daysRemaining <= 0
    ? `<strong style="color:${urgencyColor}">Your agreement has already expired.</strong>`
    : daysRemaining === 1
      ? `Your agreement expires <strong style="color:${urgencyColor}">tomorrow</strong>.`
      : `Your agreement expires in <strong style="color:${urgencyColor}">${daysRemaining} days</strong>.`;

  const rateStr = params.adRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ctaButton = params.signingLink
    ? `<tr><td align="center" style="padding:32px 40px 24px 40px"><a href="${params.signingLink}" style="display:inline-block;background:${brand.brandColor};color:#fff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:4px;letter-spacing:.5px">Sign &amp; Renew Agreement</a></td></tr>`
    : '';

  const freqRow = params.frequency
    ? `<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Frequency:</strong> ${params.frequency}</td></tr>`
    : '';
  const adSizeRow = params.adSize
    ? `<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Ad Size:</strong> ${params.adSize}</td></tr>`
    : '';

  const attachBlock = params.agreementDataUri
    ? `<tr><td style="padding:0 40px 24px 40px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f9f4;border:2px solid #359d73;border-radius:6px"><tr><td style="padding:16px 20px"><p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:12px;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:.8px">&#128196; Renewal Agreement Attached</p><p style="margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:13px;color:#047857;line-height:1.6">Your pre-filled renewal agreement is ready to sign. Your current rate of <strong>$${rateStr}/issue</strong> is <strong>locked</strong> — same ad size, frequency, and terms as your original agreement.</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border:1px solid #6ee7b7;border-radius:4px"><tr><td style="padding:12px 16px"><span style="font-size:20px;vertical-align:middle;margin-right:10px">&#128196;</span><span style="display:inline-block;vertical-align:middle"><strong style="font-family:Arial,sans-serif;font-size:13px;color:#065f46">Renewal Agreement — ${companyName}</strong><br><span style="font-family:Arial,sans-serif;font-size:11px;color:#6b7280">Rate locked &middot; Same terms &middot; Signature fields ready</span></span></td></tr></table><p style="margin:10px 0 0 0;font-family:Arial,sans-serif;font-size:12px;color:#047857">&#128274; <strong>Rate Lock:</strong> Sign before <strong>${params.expirationDate}</strong> to lock in your rate of <strong>$${rateStr}/issue</strong>.</p></td></tr></table></td></tr>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Advertising Agreement Renewal</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f4;padding:32px 0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
<tr><td style="background:${brand.brandColor};padding:28px 40px;text-align:center"><h1 style="margin:0;color:#fff;font-family:Arial,sans-serif;font-size:26px;font-weight:bold;letter-spacing:1px">${brand.brandName}</h1><p style="margin:6px 0 0 0;color:rgba(255,255,255,.85);font-family:Arial,sans-serif;font-size:13px;letter-spacing:.5px">ADVERTISING AGREEMENT RENEWAL</p></td></tr>
<tr><td style="background:#fff8f0;border-bottom:1px solid #ffe0c0;padding:12px 40px;text-align:center"><p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#555">${urgencyText}</p></td></tr>
<tr><td style="padding:36px 40px 16px 40px"><p style="margin:0;font-family:Arial,sans-serif;font-size:16px;color:#222">Dear ${advertiserName},</p></td></tr>
<tr><td style="padding:0 40px 20px 40px"><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#444;line-height:1.7">Your advertising agreement with <strong>${brand.brandName}</strong> for <strong>${companyName}</strong> is set to expire on <strong>${params.expirationDate}</strong>. To ensure uninterrupted service and lock in your current rate of <strong>$${rateStr}</strong>, please renew before the expiration date.</p></td></tr>
<tr><td style="padding:0 40px 24px 40px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9f9f9;border:1px solid #e8e8e8;border-radius:4px;border-left:4px solid ${brand.brandColor}"><tr><td style="padding:20px 24px"><p style="margin:0 0 6px 0;font-family:Arial,sans-serif;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.8px">Agreement Details</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Advertiser:</strong> ${companyName}</td></tr><tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Expiration Date:</strong> ${params.expirationDate}</td></tr>${adSizeRow}${freqRow}<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#444;padding:4px 0"><strong>Current Rate (Locked):</strong> $${rateStr}/issue</td></tr></table></td></tr></table></td></tr>
${attachBlock}
${ctaButton}
<tr><td style="padding:0 40px 28px 40px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fffbf0;border:1px solid #ffe58f;border-radius:4px"><tr><td style="padding:16px 20px"><p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#b75420;line-height:1.6">&#9200; <strong>Rate Lock Notice:</strong> Renew before <strong>${params.expirationDate}</strong> to keep your current rate of <strong>$${rateStr}/issue</strong>. After expiration, rates will be subject to change.</p></td></tr></table></td></tr>
<tr><td style="padding:0 40px 32px 40px"><p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#444;line-height:1.7">If you have any questions or need assistance with your renewal, please do not hesitate to reach out. We value your partnership.</p><p style="margin:16px 0 0 0;font-family:Arial,sans-serif;font-size:15px;color:#444">Warm regards,<br><strong>The ${brand.brandName} Advertising Team</strong></p></td></tr>
<tr><td style="background:#f4f4f4;border-top:1px solid #e0e0e0;padding:20px 40px;text-align:center"><p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:12px;color:#888">${brand.brandName} | <a href="${websiteUrl}" style="color:#888;text-decoration:none">${websiteUrl}</a></p><p style="margin:4px 0 0 0;font-family:Arial,sans-serif;font-size:11px;color:#aaa">This is an automated renewal reminder. Please do not reply directly to this email.</p></td></tr>
</table></td></tr></table></body></html>`;
}

// ──────────────────────────────────────────────────────────────────
// Amended Agreement Email
// Sent when an admin edits an existing agreement and wants to forward
// the updated PDF to the advertiser as an FYI — NOT a signing request.
// ──────────────────────────────────────────────────────────────────

export interface AmendedAgreementEmailParams {
  brand?: BrandConfig;
  companyName?: string;
  repName?: string;
  /** Free-text "what changed" summary entered by the admin. May be empty. */
  changeSummary?: string;
  /** Sender's display name, used in the sign-off (defaults to brand team). */
  senderName?: string;
}

export function amendedAgreementEmail(params: AmendedAgreementEmailParams): string {
  const brand = params.brand ?? REALTYLINE_BRAND;
  const websiteUrl = brand.websiteUrl ?? 'https://realtynewsnow.app';
  const advertiserName = params.repName ?? 'Advertiser';
  const companyName = params.companyName ?? '';
  const signOff = params.senderName ?? `The ${brand.brandName} Advertising Team`;

  const changeBlock = params.changeSummary && params.changeSummary.trim()
    ? `<tr><td style="padding:0 40px 24px 40px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fffbf0;border:1px solid #ffe58f;border-radius:4px"><tr><td style="padding:16px 20px"><p style="margin:0 0 6px 0;font-family:Arial,sans-serif;font-size:12px;font-weight:800;color:#b75420;text-transform:uppercase;letter-spacing:.8px">What changed</p><p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#b75420;line-height:1.6;white-space:pre-wrap">${escapeHtml(params.changeSummary.trim())}</p></td></tr></table></td></tr>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Amended Advertising Agreement</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f4;padding:32px 0"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
<tr><td style="background:${brand.brandColor};padding:28px 40px;text-align:center"><h1 style="margin:0;color:#fff;font-family:Arial,sans-serif;font-size:26px;font-weight:bold;letter-spacing:1px">${brand.brandName}</h1><p style="margin:6px 0 0 0;color:rgba(255,255,255,.85);font-family:Arial,sans-serif;font-size:13px;letter-spacing:.5px">UPDATED ADVERTISING AGREEMENT</p></td></tr>
<tr><td style="padding:36px 40px 8px 40px"><p style="margin:0;font-family:Arial,sans-serif;font-size:16px;color:#222">Dear ${advertiserName},</p></td></tr>
<tr><td style="padding:8px 40px 16px 40px"><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#444;line-height:1.7">We've updated your advertising agreement${companyName ? ` for <strong>${escapeHtml(companyName)}</strong>` : ''}. The latest copy is attached to this email for your records — no action is needed on your end.</p></td></tr>
${changeBlock}
<tr><td style="padding:0 40px 24px 40px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f9f4;border:2px solid #359d73;border-radius:6px"><tr><td style="padding:16px 20px"><p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:12px;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:.8px">&#128206; Updated Agreement Attached</p><p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#047857;line-height:1.6">The PDF attached to this email reflects all updates and supersedes any prior version. If anything looks incorrect, just reply to this email and we'll get it sorted.</p></td></tr></table></td></tr>
<tr><td style="padding:0 40px 32px 40px"><p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#444;line-height:1.7">Thank you for advertising with ${brand.brandName}.</p><p style="margin:16px 0 0 0;font-family:Arial,sans-serif;font-size:15px;color:#444">Best,<br><strong>${escapeHtml(signOff)}</strong></p></td></tr>
<tr><td style="background:#f4f4f4;border-top:1px solid #e0e0e0;padding:20px 40px;text-align:center"><p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#888">${brand.brandName} | <a href="${websiteUrl}" style="color:#888;text-decoration:none">${websiteUrl}</a></p></td></tr>
</table></td></tr></table></body></html>`;
}
