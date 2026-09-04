/**
 * Send an in-app/email notification when a new pending event lands in the
 * admin review queue.
 *
 * Two trigger paths share this helper:
 *   1. Advertiser self-submission     → /api/submit-event/[token]
 *   2. Gemini Facebook event detector → /api/cron/scan-fb-events
 *
 * Sends to whichever address ADMIN_NOTIFICATION_EMAIL points to, falling
 * back to EMAIL_REPLY_TO and then tawanna@realtynewsnow.app so a missing
 * env var doesn't silently drop notifications.
 *
 * Wrapped in try/catch in the caller — never throws.
 */

import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/server/email/html';

interface Args {
  eventId: number;
  title: string;
  organizer: string | null;
  source: 'submission' | 'public-submission' | 'facebook-llm' | 'facebook-graph';
  startDate: string | null;
  recipients?: string[];
}

function originForLink(): string {
  // Vercel sets VERCEL_URL (host only, no scheme).
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://realtynewsnow.app';
}

function pickAdminAddress(): string {
  return (
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.EMAIL_REPLY_TO ||
    'tawanna@realtynewsnow.app'
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return '(date pending)';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export async function notifyAdminsPendingEvent({
  eventId,
  title,
  organizer,
  source,
  startDate,
  recipients,
}: Args): Promise<void> {
  const to = recipients?.length ? recipients : pickAdminAddress();
  const reviewUrl = `${originForLink()}/admin/events/${eventId}`;
  const sourceLabel =
    source === 'public-submission'
      ? 'a public Calendar submission'
      : source === 'submission'
      ? 'an advertiser self-submission'
      : source === 'facebook-graph'
        ? 'a native Facebook Page event (Graph API)'
        : 'Gemini auto-detection from the RealtyLine Facebook Page';
  const sourceDisplay =
    source === 'public-submission'
      ? 'Public Calendar form'
      : source === 'submission'
      ? 'Advertiser submission'
      : source === 'facebook-graph'
        ? 'Facebook Page (Graph API)'
        : 'Facebook Page (LLM)';

  const subject = `[Realty News Now] Pending event — ${title.slice(0, 80)}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #301D5D; margin: 0 0 12px;">New event awaiting review</h2>
      <p style="color: #444; font-size: 14px; line-height: 1.5; margin: 0 0 16px;">
        A new event landed in the admin queue via ${sourceLabel}. Review it
        and approve to publish to the Calendar.
      </p>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #666; width: 110px;">Title</td>
            <td style="padding: 6px 0; color: #111;"><strong>${escapeHtml(title)}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Organizer</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(organizer ?? '—')}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Start</td>
            <td style="padding: 6px 0; color: #111;">${escapeHtml(fmtDate(startDate))}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Source</td>
            <td style="padding: 6px 0; color: #111;">${sourceDisplay}</td></tr>
      </table>

      <p style="margin: 24px 0 8px;">
        <a href="${reviewUrl}"
           style="display: inline-block; background: #301D5D; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Review in admin
        </a>
      </p>

      <p style="color: #999; font-size: 12px; margin: 16px 0 0;">
        Event ID: ${eventId}
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.warn('[notifyAdminsPendingEvent]', result.error);
  }
}

