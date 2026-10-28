import { getSql } from '@/lib/db';
import { generateAgreementPdfBuffer } from '@/lib/agreement-pdf';
import { sendEmail } from '@/lib/email';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/**
 * The agreement is signed first; once the payment method is confirmed the agreement is
 * amended with it and the amended copy is emailed. If the agreement is not signed yet there is
 * nothing to amend: the signed copy will already carry the payment method.
 */
export async function amendAgreementWithPayment(agreementId: string, sessionId: string): Promise<void> {
  try {
    const sql = getSql();
    const rows = (await sql`SELECT * FROM agreements WHERE id = ${agreementId}`) as unknown as Agreement[];
    const ag = rows[0];
    if (!ag || !ag.signed_at || !ag.card_type) return;
    const log = (ag.audit_log ?? []) as AgreementAuditEntry[];
    const marker = `[session ${sessionId}]`;
    if (log.some((e) => e.event === 'amended_payment_method' && String(e.details ?? '').includes(marker))) return;
    const to = Array.from(new Set([ag.advertiser_email, ag.billing_email].filter((x): x is string => !!x && x.includes('@')).map((x) => x.trim())));
    let sent = 'no recipient on file';
    if (to.length) {
      const pdf = Buffer.from(await generateAgreementPdfBuffer(ag)).toString('base64');
      const company = ag.company_name ?? 'your company';
      const res = await sendEmail({
        to: to.join(','),
        subject: `Amended advertising agreement - ${company}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#262626;font-size:15px;line-height:1.55"><p>Hello,</p><p>The payment method for ${esc(company)}'s advertising agreement has been confirmed (${esc(ag.card_type)}${ag.card_number_last4 ? `, ending ${esc(ag.card_number_last4)}` : ''}). The signed agreement has been amended to include it. The amended copy is attached.</p></div>`,
        attachments: [{ filename: 'amended-agreement.pdf', content: pdf, contentType: 'application/pdf' }],
      });
      sent = res.ok ? `emailed to ${to.join(', ')}` : `email failed: ${res.error}`;
    }
    const next = appendAudit(log, { event: 'amended_payment_method', timestamp: new Date().toISOString(), user_email: 'system', details: `Agreement amended after payment method confirmed (${ag.card_type}); ${sent} ${marker}` });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(next)}::jsonb, updated_at = NOW() WHERE id = ${agreementId}`;
  } catch (e) {
    console.warn('[amendAgreementWithPayment]', e instanceof Error ? e.message : String(e));
  }
}
