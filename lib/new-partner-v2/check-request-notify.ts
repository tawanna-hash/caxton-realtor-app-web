// lib/new-partner-v2/check-request-notify.ts
//
// Agreements (Beta): email the team when a partner asks to pay a digital
// agreement by check. Never throws. Respects the notification setting.

import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/server/email/html';
import { ADMIN_INBOX } from '@/lib/admin-inbox';
import { getNotifications } from '@/lib/agreements-v2/settings';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';

export async function notifyCheckRequest(ag: { id: string; company_name: string | null; rep_name: string | null }, note: string): Promise<{ sent: boolean; reason?: string; messageId?: string }> {
  try {
    const settings = await getNotifications();
    if (!settings.team_check_request) return { sent: false, reason: 'turned off in Notifications' };
    const company = ag.company_name || 'A partner';
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #301D5D; margin: 0 0 12px;">Check payment request</h2>
        <p style="color: #444; font-size: 14px; line-height: 1.5; margin: 0 0 16px;">
          <strong>${escapeHtml(company)}</strong>${ag.rep_name ? ` (${escapeHtml(ag.rep_name)})` : ''} asked to pay by check. Their agreement includes digital products or e-Blasts, which are paid before signing by bank account or credit card unless you approve a check.
        </p>
        ${note ? `<p style="color: #444; font-size: 14px; margin: 0 0 16px;">Their note: ${escapeHtml(note)}</p>` : ''}
        <p style="color: #444; font-size: 14px; margin: 0 0 16px;">To allow it, open the Partners tab in Agreements and choose Approve check. Services are not provided until payment is received.</p>
        <p style="margin: 24px 0 8px;"><a href="${SITE}/admin/agreements/renewals-v2" style="display: inline-block; background: #301D5D; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">Open Agreements</a></p>
        <p style="color: #999; font-size: 12px; margin: 16px 0 0;">Agreement ID: ${escapeHtml(ag.id)}</p>
      </div>`;
    const res = await sendEmail({ to: ADMIN_INBOX, subject: `[Realty News Now] Check payment request - ${company.slice(0, 80)}`, html });
    return res.ok ? { sent: true, messageId: res.messageId } : { sent: false, reason: res.error };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'failed' };
  }
}
