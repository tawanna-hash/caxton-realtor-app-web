import type { Agreement } from '@/lib/agreements';
import { PUBLICATION_LABELS, type PublicationId } from '@/lib/publications';
import { chargeBaseCents } from '@/lib/new-partner-v2/service';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function agreementSummary(ag: Agreement): Array<[string, string]> {
  const base = chargeBaseCents(ag);
  const mk = ag.publication && ag.publication in PUBLICATION_LABELS ? PUBLICATION_LABELS[ag.publication as PublicationId] : 'RealtyLine';
  const rows: Array<[string, string]> = [['Advertiser', ag.company_name ?? ''], ['Publication', mk]];
  if (ag.ad_size) rows.push(['Ad size', ag.ad_size]);
  if (ag.frequency) rows.push(['Frequency', ag.frequency.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())]);
  if (ag.total_monthly_rate_cents != null) rows.push(['Monthly rate', usd(ag.total_monthly_rate_cents)]);
  if (base && base > 0) rows.push(['Amount due now', usd(base)]);
  return rows.filter(([, v]) => v);
}

export function apEmail(ag: Agreement, url: string) {
  const rows = agreementSummary(ag);
  const company = ag.company_name ?? 'your client';
  const subject = `Payment setup for ${company}'s advertising agreement`;
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#262626;font-size:15px;line-height:1.55">
<p>Hello,</p>
<p>${esc(company)} asked us to send you the payment details for their advertising agreement so your team can set up payment. A copy of the agreement is below.</p>
<table style="border-collapse:collapse;margin:12px 0">${table}</table>
<p><a href="${url}" style="display:inline-block;background:#301D5D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Review and set up payment</a></p>
<p style="font-size:13px;color:#6b6b6b">The link shows the agreement details and lets you pay by bank account (ACH) or credit card. The agreement itself is signed by ${esc(company)}'s authorized representative, not through this link.</p>
</div>`;
  const text = `${company} asked us to send you the payment details for their advertising agreement.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReview and set up payment: ${url}\n\nThe agreement itself is signed by ${company}'s authorized representative, not through this link.`;
  return { from: undefined as string | undefined, subject, html, text, replyTo: undefined as string | undefined };
}
