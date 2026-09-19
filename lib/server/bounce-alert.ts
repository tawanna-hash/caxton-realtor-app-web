// lib/server/bounce-alert.ts
//
// Roll a Resend hard-bounce event up onto the advertiser row (best-effort)
// and fire an alert email to the admin so bounces don't sit unnoticed.
//
// Called from app/api/webhooks/resend/route.ts under `email.bounced`.

import { exec, query } from '@/lib/server/db/neon';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/server/logger';

const ALERT_TO = process.env.BOUNCE_ALERT_TO ?? 'tawanna@realtynewsnow.app';

export async function handleBounceAlert(params: {
  emailId: string;
  bounceType: string | null;
}): Promise<void> {
  const { emailId, bounceType } = params;

  // 1) Look up the recipient email from email_log
  const rows = await query<{ to_address: string; subject: string | null }>(
    `SELECT to_address, subject FROM email_log
      WHERE provider_message_id = $1
      LIMIT 1`,
    [emailId],
  );
  if (rows.length === 0) {
    logger.warn({ emailId }, '[bounce-alert] no matching email_log row');
    return;
  }
  const toAddress = rows[0].to_address;
  const subject = rows[0].subject ?? '(no subject)';

  // 2) Roll up onto advertisers by case-insensitive email match (best-effort)
  try {
    const upd = await exec(
      `UPDATE advertisers
          SET last_bounced_at = NOW(),
              bounce_count    = COALESCE(bounce_count, 0) + 1,
              last_bounce_type = $2
        WHERE lower(contact_email) = lower($1)`,
      [toAddress, bounceType],
    );
    logger.warn(
      { emailId, toAddress, rows: upd.rowCount, bounceType },
      '[bounce-alert] advertiser rows updated',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logger.error({ err: msg, emailId, toAddress }, '[bounce-alert] advertiser update failed');
  }

  // 3) Fire alert email to admin (never fails the webhook)
  try {
    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; color:#111827; max-width:560px;">
        <h2 style="color:#b91c1c; margin:0 0 12px;">Email bounced</h2>
        <p style="margin:0 0 8px;">A marketing/outreach email hard-bounced and will not reach the recipient.</p>
        <table style="border-collapse:collapse; margin-top:12px; font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Recipient</td><td><strong>${escapeHtml(toAddress)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Subject</td><td>${escapeHtml(subject)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Bounce type</td><td>${escapeHtml(bounceType ?? 'unknown')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Resend ID</td><td style="font-family:monospace; font-size:12px;">${escapeHtml(emailId)}</td></tr>
        </table>
        <p style="margin:16px 0 0;"><a href="https://realtynewsnow.app/admin/crm" style="color:#ea580c;">Open CRM</a> — the advertiser row will show a red Bounced badge.</p>
      </div>
    `;
    await sendEmail({
      to: ALERT_TO,
      subject: `[Bounce] ${toAddress}`,
      html,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    logger.error({ err: msg, emailId, toAddress }, '[bounce-alert] alert email send failed');
  }
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}
