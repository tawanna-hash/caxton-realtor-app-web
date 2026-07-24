/**
 * Email Tawanna when a new builder/developer promotion lands in the
 * pending review queue. Move-in ready homes (kind='listing') are
 * auto-published by the scraper and never trigger this — only promotions
 * (which need a human to vet legal text / dates / community claims) do.
 *
 * Triggered from upsertBuilderInventoryByExternalId when a promotion is
 * first created. Wrapped in try/catch in the caller — never throws.
 */

import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/server/email/html';

interface Args {
  id: number | string;
  title: string;
  builderName: string;
  promoType: string | null;
  communityName: string | null;
  city: string | null;
  source: 'scraper' | 'submission' | 'admin';
}

function originForLink(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://realtynewsnow.app';
}

function pickAdminAddress(): string {
  return (
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.EMAIL_REPLY_TO ||
    'tawanna@myrealtyline.com'
  );
}

export async function notifyPromotionPending({
  id,
  title,
  builderName,
  promoType,
  communityName,
  city,
  source,
}: Args): Promise<void> {
  const to = pickAdminAddress();
  const reviewUrl = `${originForLink()}/admin/inventory?status=pending&kind=promotion`;
  const sourceLabel =
    source === 'submission'
      ? 'a builder self-submission'
      : source === 'admin'
        ? 'manual admin entry'
        : 'a builder/developer site scrape';

  const subject = `[Realty News Now] Pending promotion — ${title.slice(0, 80)}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #301D5D; margin: 0 0 12px;">New promotion awaiting review</h2>
      <p style="color: #444; font-size: 14px; line-height: 1.5; margin: 0 0 16px;">
        A new builder/developer promotion landed in the pending queue via
        ${sourceLabel}. Review the legal text, dates, and participating
        communities, then approve to publish.
      </p>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #666; width: 130px;">Title</td>
            <td style="padding: 6px 0; color: #111;"><strong>${escapeHtml(title)}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Builder</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(builderName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Promo type</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(promoType ?? '—')}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Community</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(communityName ?? '—')}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">City</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(city ?? '—')}</td></tr>
      </table>

      <p style="margin: 24px 0 8px;">
        <a href="${reviewUrl}"
           style="display: inline-block; background: #301D5D; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Review all pending promotions
        </a>
      </p>

      <p style="color: #999; font-size: 12px; margin: 16px 0 0;">
        Promotion ID: ${escapeHtml(String(id))}
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.warn('[notifyPromotionPending]', result.error);
  }
}
