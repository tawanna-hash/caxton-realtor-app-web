// Reminders for "set up ACH later" requests.
//
// When a client picks ACH on the signing page and sends the setup link to
// accounts payable, we track the request here. A daily cron emails AP a
// reminder on day 3 and day 7, then alerts the market's billing inbox on day
// 10. The request is resolved as soon as any payment method is saved for the
// agreement or its client, or the agreement is cancelled.
import { getSql } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { signPaymentSetupToken, paymentSetupUrl } from '@/lib/payment-setup-token';
import { renderPaymentMethodHtml, renderPaymentMethodText, type PaymentMethodFields } from '@/lib/agreements-v2/payment-method-template';
import { loadSetupTarget, logClientSetup } from '@/lib/server/payment-setup';

let ready = false;
export async function ensurePaymentSetupRequestsSchema() {
  if (ready) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS payment_setup_requests (
      agreement_id text PRIMARY KEY,
      sent_to text NOT NULL,
      market text,
      requested_at timestamptz NOT NULL DEFAULT NOW(),
      reminders_sent int NOT NULL DEFAULT 0,
      last_reminder_at timestamptz,
      resolved_at timestamptz,
      resolved_reason text
    )`;
  ready = true;
}

/** Start (or restart) tracking after the link was emailed to AP. */
export async function recordSetupRequest(agreementId: string, sentTo: string, market: string | null) {
  await ensurePaymentSetupRequestsSchema();
  await getSql()`
    INSERT INTO payment_setup_requests (agreement_id, sent_to, market)
    VALUES (${agreementId}, ${sentTo}, ${market})
    ON CONFLICT (agreement_id) DO UPDATE SET
      sent_to = EXCLUDED.sent_to, market = EXCLUDED.market, requested_at = NOW(),
      reminders_sent = 0, last_reminder_at = NULL, resolved_at = NULL, resolved_reason = NULL`;
}

/** Clear the alert. Best effort; never throws. */
export async function resolveSetupRequest(agreementId: string | null | undefined, reason: string) {
  if (!agreementId) return;
  try {
    await ensurePaymentSetupRequestsSchema();
    await getSql()`UPDATE payment_setup_requests SET resolved_at = NOW(), resolved_reason = ${reason} WHERE agreement_id = ${agreementId} AND resolved_at IS NULL`;
  } catch (e) {
    console.warn('[payment-setup-reminders] resolve failed', e);
  }
}

type Req = { agreement_id: string; sent_to: string; market: string | null; requested_at: string; reminders_sent: number };
// Days after the original request for each stage: AP reminder, AP reminder, internal alert.
const STAGE_DAYS = [3, 7, 10];

export async function runPaymentSetupReminderSweep(opts: { dry?: boolean } = {}) {
  await ensurePaymentSetupRequestsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT r.agreement_id, r.sent_to, r.market, r.requested_at, r.reminders_sent
      FROM payment_setup_requests r
     WHERE r.resolved_at IS NULL AND r.reminders_sent < ${STAGE_DAYS.length}
     ORDER BY r.requested_at ASC LIMIT 200`) as unknown as Req[];
  const out = { checked: rows.length, reminded: 0, escalated: 0, resolved: 0, failed: 0, would_send: [] as string[] };
  for (const r of rows) {
    const t = await loadSetupTarget({ kind: 'agreement', id: r.agreement_id });
    const hasMethod = !!(t?.agreement?.stripe_payment_method_id || t?.advertiser?.stripe_payment_method_id);
    if (!t || hasMethod) { if (!opts.dry) await resolveSetupRequest(r.agreement_id, !t ? 'agreement cancelled or removed' : 'payment method saved'); out.resolved++; continue; }
    // Only chase signed agreements; an unsigned one is a different follow-up.
    if (!t.agreement?.signed_at) continue;
    const ageDays = (Date.now() - new Date(r.requested_at).getTime()) / 86_400_000;
    if (ageDays < STAGE_DAYS[r.reminders_sent]) continue;
    const stage = r.reminders_sent;
    if (opts.dry) { out.would_send.push(`${r.agreement_id}:${stage === 2 ? 'internal' : r.sent_to}`); continue; }
    // Claim this stage atomically so overlapping runs never double-send.
    const claimed = (await sql`UPDATE payment_setup_requests SET reminders_sent = reminders_sent + 1, last_reminder_at = NOW() WHERE agreement_id = ${r.agreement_id} AND reminders_sent = ${stage} AND resolved_at IS NULL RETURNING 1`) as unknown[];
    if (claimed.length === 0) continue;
    try {
      if (stage < 2) {
        const { token, expiresAt } = signPaymentSetupToken({ kind: 'agreement', id: r.agreement_id });
        const ag = t.agreement;
        const monthly = ag?.total_monthly_rate_cents ?? null;
        const fields: PaymentMethodFields = {
          client_first_name: 'there',
          agreement_name_or_number: ag ? ([t.company, ag.ad_size].filter(Boolean).join(' \u2014 ') || `Agreement ${ag.id.slice(0, 8)}`) : 'your advertising agreement',
          payment_terms: monthly != null ? `${(monthly / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} per month` : 'the amounts in the advertising agreement',
          billing_schedule: monthly != null ? 'Monthly' : 'the billing schedule in the advertising agreement',
          payment_setup_url: paymentSetupUrl(token),
        };
        const mail = renderPaymentMethodHtml(t.brand.market, fields, { reminder: true });
        const sent = await sendEmail({ from: mail.from, to: r.sent_to, subject: mail.subject, html: mail.html, text: renderPaymentMethodText(t.brand.market, fields, { reminder: true }), replyTo: mail.brand.billing_contact_email });
        if (!sent.ok) throw new Error('send failed');
        if (t.advertiser) {
          await logClientSetup({ advertiserId: t.advertiser.id, event: 'request_sent', actor: 'reminder', market: t.brand.market, fromEmail: mail.from, to: [r.sent_to], subject: mail.subject, html: mail.html, setupUrl: fields.payment_setup_url, linkExpiresAt: expiresAt, agreementId: r.agreement_id, details: `Automatic reminder ${stage + 1} of 2` });
        }
        out.reminded++;
      } else {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const sent = await sendEmail({
          from: `Tawanna Verock <${t.brand.sender_email}>`,
          to: t.brand.billing_contact_email,
          subject: `Still no payment method — ${t.company ?? 'client'} (${t.brand.brand})`,
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#16132D"><p><strong>${esc(t.company ?? 'A client')}</strong> chose ACH and asked to set it up later, but there is still no payment method on file ${Math.floor(ageDays)} days later. Setup link and two reminders went to ${esc(r.sent_to)}.</p><p>Follow up with the client before the first invoice.</p></div>`,
        });
        if (!sent.ok) throw new Error('send failed');
        out.escalated++;
      }
    } catch (e) {
      await sql`UPDATE payment_setup_requests SET reminders_sent = ${stage} WHERE agreement_id = ${r.agreement_id} AND reminders_sent = ${stage + 1}`.catch(() => null);
      console.error('[payment-setup-reminders] failed', r.agreement_id, e);
      out.failed++;
    }
  }
  return out;
}
