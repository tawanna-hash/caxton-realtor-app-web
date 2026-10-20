// lib/new-partner-v2/service.ts
//
// New-partner agreements (Beta). Server helpers for the 3-screen flow
// (Review, Pay, Sign). Additive: it reads the quote/agreement the admin already
// created, emails a link to the new page, and finalizes through the LIVE
// signing endpoint. No live route, table or email template is modified.

import { signToken } from '@/lib/sign-token';
import { sendEmail } from '@/lib/email';
import { brandForPublication } from '@/lib/email-templates';
import { escapeHtml } from '@/lib/server/email/html';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { isAdChannel, deriveChannelFromAgreementType, type AdChannel } from '@/lib/ad-channels';
import type { getSql } from '@/lib/db';
import { freqMonths } from '@/lib/renewals-v2/pricing';
import { getDefaults, renderIntro } from '@/lib/agreements-v2/settings';

type Sql = ReturnType<typeof getSql>;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';

export type NewPartnerState = 'not_started' | 'live_sent' | 'sent' | 'opened';

export type NewPartnerCandidate = {
  id: string;
  company_name: string | null;
  rep_name: string | null;
  email: string | null;
  publication: string | null;
  status: string;
  channel: AdChannel;
  ad_size: string | null;
  frequency: string | null;
  rate_cents: number | null;
  total_cents: number | null;
  needs_full_form: boolean;
  state: NewPartnerState;
  last_sent_at: string | null;
  created_at: string | null;
};

type Row = Agreement & { channel?: string | null; line_count?: number };

export function channelOfRow(r: { type: string | null; channel?: string | null }): AdChannel {
  return isAdChannel(r.channel) ? r.channel : deriveChannelFromAgreementType(r.type as never);
}

/** One-tap eligible: a single-line print agreement with a rate and ad size. */
export function needsFullForm(r: Row): boolean {
  return channelOfRow(r) !== 'print' || (r.line_count ?? 0) > 0 || r.ad_rate_cents == null || !r.ad_size;
}

function events(log: AgreementAuditEntry[] | null | undefined, name: string): AgreementAuditEntry[] {
  return (Array.isArray(log) ? log : []).filter((e) => e.event === name);
}

export function totalCents(r: Pick<Agreement, 'ad_rate_cents' | 'amount_cents' | 'frequency'>): number | null {
  if (r.ad_rate_cents == null) return r.amount_cents ?? null;
  return r.ad_rate_cents * freqMonths(r.frequency);
}

export async function listNewPartnerCandidates(sql: Sql): Promise<NewPartnerCandidate[]> {
  const rows = await sql`
    SELECT ag.*,
      (SELECT COUNT(*)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS line_count
      FROM agreements ag
     WHERE COALESCE(ag.is_renewal, false) = false
       AND ag.signed_at IS NULL
       AND ag.status IN ('draft', 'proposal_sent', 'proposal_approved', 'sent')
     ORDER BY ag.created_at DESC
     LIMIT 200
  ` as unknown as Row[];
  return rows.map((r): NewPartnerCandidate => {
    const sent = events(r.audit_log, 'newpartner_v2_sent');
    const opened = events(r.audit_log, 'newpartner_v2_opened');
    let state: NewPartnerState = 'not_started';
    if (opened.length) state = 'opened';
    else if (sent.length) state = 'sent';
    else if (r.status !== 'draft') state = 'live_sent';
    return {
      id: r.id,
      company_name: r.company_name,
      rep_name: r.rep_name,
      email: r.advertiser_email || r.billing_email,
      publication: r.publication,
      status: r.status,
      channel: channelOfRow(r),
      ad_size: r.ad_size,
      frequency: r.frequency,
      rate_cents: r.ad_rate_cents,
      total_cents: totalCents(r),
      needs_full_form: needsFullForm(r),
      state,
      last_sent_at: sent.length ? sent[sent.length - 1].timestamp : null,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    };
  });
}

export function agreementLink(id: string): string {
  return `${SITE_URL}/agree/${signToken(id, 60 * 60 * 24 * 60)}`;
}

export async function recordNewPartnerEvent(
  sql: Sql,
  agreementId: string,
  event: string,
  details: string,
  userEmail?: string | null,
): Promise<void> {
  const rows = await sql`SELECT audit_log FROM agreements WHERE id = ${agreementId}` as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
  const log = appendAudit(rows[0]?.audit_log, {
    event,
    timestamp: new Date().toISOString(),
    user_email: userEmail ?? undefined,
    details,
  });
  await sql`UPDATE agreements SET audit_log = ${JSON.stringify(log)}::jsonb WHERE id = ${agreementId}`;
}

function money(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function newPartnerEmailHtml(ag: Agreement, link: string, intro?: string | null): string {
  const brand = brandForPublication(ag.publication);
  return `<!doctype html><html><body style="margin:0;background:#F6F5FB;font-family:Arial,Helvetica,sans-serif;color:#1B1726">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #E6E5EC;border-radius:12px">
<tr><td style="background:${brand.brandColor};color:#fff;padding:18px 28px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${escapeHtml(brand.brandName)}</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px 0;font-size:16px">Hi ${escapeHtml(ag.rep_name ?? 'there')},</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55">${escapeHtml(renderIntro(intro || 'Your advertising agreement is ready. Review the details, choose how to pay, and sign. It takes about two minutes.', ag))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5FB;border-radius:8px"><tr><td style="padding:16px 18px;font-size:14px;line-height:1.7">
<strong>${escapeHtml(ag.company_name ?? '')}</strong><br>
${ag.ad_size ? `Ad size: ${escapeHtml(ag.ad_size)}<br>` : ''}${ag.frequency ? `Frequency: ${escapeHtml(ag.frequency)}<br>` : ''}Monthly rate: ${money(ag.ad_rate_cents)}
</td></tr></table>
<p style="margin:24px 0;text-align:center"><a href="${link}" style="display:inline-block;background:${brand.brandColor};color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px">Review &amp; Sign</a></p>
<p style="margin:0;font-size:12px;color:#6B6878">Questions? Just reply to this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export async function sendNewPartnerEmail(
  sql: Sql,
  agreementId: string,
  opts: { adminEmail?: string | null; to?: string | null },
): Promise<{ ok: boolean; to?: string; error?: string; messageId?: string }> {
  const rows = await sql`SELECT * FROM agreements WHERE id = ${agreementId}` as unknown as Agreement[];
  const ag = rows[0];
  if (!ag) return { ok: false, error: 'agreement not found' };
  if (ag.signed_at) return { ok: false, error: 'already signed' };
  const to = opts.to || ag.advertiser_email || ag.billing_email;
  if (!to) return { ok: false, error: 'no email address on file' };
  const link = agreementLink(agreementId);
  const result = await sendEmail({
    to,
    subject: `Your advertising agreement, ${ag.company_name ?? ''}`.trim(),
    html: newPartnerEmailHtml(ag, link, (await getDefaults(sql)).intro_new),
  });
  if (!result.ok) return { ok: false, to, error: result.error };
  if (ag.status === 'draft') {
    await sql`UPDATE agreements SET status = 'sent', sent_to_email = ${to}, updated_at = NOW() WHERE id = ${agreementId}`;
  }
  await recordNewPartnerEvent(sql, agreementId, 'newpartner_v2_sent', `New-partner agreement link sent to ${to}. Message ${result.messageId ?? 'n/a'}`, opts.adminEmail);
  return { ok: true, to, messageId: result.messageId };
}
