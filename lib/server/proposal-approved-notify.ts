/**
 * Send an email notification when a client APPROVES a proposal via the sign
 * portal (status proposal_sent -> proposal_approved). Mirrors
 * agreement-signed-notify.ts. Called in a try/catch — never throws.
 *
 * Recipient resolution (first non-empty wins):
 *   1. AGREEMENT_SIGNED_NOTIFICATION_EMAIL env var
 *   2. ADMIN_NOTIFICATION_EMAIL env var
 *   3. EMAIL_REPLY_TO env var
 *   4. tawanna@myrealtyline.com (hard-coded fallback)
 */

import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/server/email/html';
import type { Agreement } from '@/lib/agreements';

function originForLink(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://realtynewsnow.app';
}

function pickRecipient(): string {
  return (
    process.env.AGREEMENT_SIGNED_NOTIFICATION_EMAIL ||
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.EMAIL_REPLY_TO ||
    'tawanna@myrealtyline.com'
  );
}

function fmtCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function notifyProposalApproved(ag: Agreement): Promise<void> {
  const to = pickRecipient();
  const reviewUrl = `${originForLink()}/admin/agreements?focus=${encodeURIComponent(ag.id)}`;

  const company = ag.company_name || '(unnamed advertiser)';
  const approver = ag.rep_name || ag.advertiser_email || '(unknown)';
  const adSize = ag.ad_size || '—';
  const frequency = ag.frequency || '—';
  const monthly = fmtCents(ag.total_monthly_rate_cents);

  const subject = `[Realty News Now] Insertion order approved — ${company.slice(0, 80)}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #301D5D; margin: 0 0 12px;">Insertion order approved — ready for final signature</h2>
      <p style="color: #444; font-size: 14px; line-height: 1.5; margin: 0 0 16px;">
        <strong>${escapeHtml(company)}</strong> approved their advertising insertion order. Review their selections,
        then send the final agreement for signature.
      </p>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #666; width: 140px;">Company</td>
            <td style="padding: 6px 0; color: #111;"><strong>${escapeHtml(company)}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Approved by</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(approver)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Ad size</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(adSize)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Frequency</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(frequency)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Monthly rate</td>
            <td style="padding: 6px 0; color: #111;"><strong>${escapeHtml(monthly)}</strong> (indicative — confirm in final agreement)</td></tr>
      </table>

      <p style="margin: 24px 0 8px;">
        <a href="${reviewUrl}"
           style="display: inline-block; background: #ea580c; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Open in admin &amp; send final agreement
        </a>
      </p>

      <p style="color: #999; font-size: 12px; margin: 16px 0 0;">
        Agreement ID: ${escapeHtml(ag.id)}
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.warn('[notifyProposalApproved]', result.error);
  }
}
