// lib/renewals-v2/service.ts
//
// Renewals (Beta). Server-side helpers for the one-tap renewal flow. Everything
// here is additive: it reads the live `agreements` data, creates a renewal
// draft linked by `renewed_from_id`, and reuses the live signing pipeline
// (/api/ad-sign/[token]) to finalize. No live route or table is modified.

import { getDefaults, renderIntro } from '@/lib/agreements-v2/settings';
import { signToken } from '@/lib/sign-token';
import { sendEmail } from '@/lib/email';
import { brandForPublication } from '@/lib/email-templates';
import { escapeHtml } from '@/lib/server/email/html';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { renewalOfferDeadline } from '@/lib/renewal-offer';
import { isAdChannel, deriveChannelFromAgreementType, type AdChannel } from '@/lib/ad-channels';
import type { getSql } from '@/lib/db';
import { computeNextTerm, computeRenewalPrice, freqMonths } from './pricing';

type Sql = ReturnType<typeof getSql>;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
export const REMINDER_STAGES = [7, 3, 1] as const;

export type RenewalV2State = 'not_started' | 'draft' | 'sent' | 'opened' | 'signed';

export type Candidate = {
  id: string;
  company_name: string | null;
  rep_name: string | null;
  email: string | null;
  publication: string | null;
  channel: AdChannel;
  ad_size: string | null;
  frequency: string | null;
  rate_cents: number | null;
  new_rate_cents: number | null;
  exp_date: string | null;
  days_left: number | null;
  needs_full_form: boolean;
  state: RenewalV2State;
  renewal_id: string | null;
  last_sent_at: string | null;
  reminders_sent: number;
};

function dateOnly(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(`${iso}T00:00:00`);
  return Math.round((e.getTime() - t.getTime()) / 86400000);
}

function channelOf(ag: Pick<Agreement, 'type'> & { channel?: string | null }): AdChannel {
  return isAdChannel(ag.channel) ? ag.channel : deriveChannelFromAgreementType(ag.type);
}

function auditHas(log: AgreementAuditEntry[] | null | undefined, event: string): AgreementAuditEntry[] {
  return (Array.isArray(log) ? log : []).filter((e) => e.event === event);
}

type PriorRow = Agreement & { channel?: string | null; line_count?: number };

/** Agreements that are expiring (or recently expired) and not yet renewed. */
export async function listCandidates(sql: Sql, windowDays = 90): Promise<Candidate[]> {
  const rows = await sql`
    SELECT ag.*,
      (SELECT COUNT(*)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS line_count
    FROM agreements ag
    WHERE ag.status IN ('signed', 'active', 'expired')
      AND COALESCE(ag.exp_date, ag.end_date) IS NOT NULL
      AND COALESCE(ag.exp_date, ag.end_date) <= (CURRENT_DATE + ${windowDays}::int)
      AND COALESCE(ag.exp_date, ag.end_date) >= (CURRENT_DATE - 90)
      AND NOT EXISTS (
        SELECT 1 FROM agreements r
         WHERE r.renewed_from_id = ag.id AND r.status IN ('signed', 'active')
      )
    ORDER BY COALESCE(ag.exp_date, ag.end_date) ASC
  ` as unknown as PriorRow[];

  const ids = rows.map((r) => r.id);
  const children = ids.length
    ? await sql`
        SELECT * FROM agreements
         WHERE renewed_from_id = ANY(${ids}::uuid[])
           AND status IN ('draft', 'sent')
         ORDER BY created_at DESC
      ` as unknown as Agreement[]
    : [];
  const childByPrior = new Map<string, Agreement>();
  for (const c of children) if (c.renewed_from_id && !childByPrior.has(c.renewed_from_id)) childByPrior.set(c.renewed_from_id, c);

  return rows.map((r): Candidate => {
    const exp = dateOnly(r.exp_date ?? r.end_date);
    const child = childByPrior.get(r.id) ?? null;
    const sent = child ? auditHas(child.audit_log, 'renewal_v2_sent') : [];
    const opened = child ? auditHas(child.audit_log, 'renewal_v2_opened') : [];
    const reminders = child ? auditHas(child.audit_log, 'renewal_v2_reminder') : [];
    let state: RenewalV2State = 'not_started';
    if (child) state = opened.length ? 'opened' : sent.length ? 'sent' : 'draft';
    const channel = channelOf(r);
    const price = computeRenewalPrice({
      ad_rate_cents: r.ad_rate_cents,
      frequency: r.frequency,
      ad_size: r.ad_size,
      exp_date: dateOnly(r.exp_date),
      end_date: dateOnly(r.end_date),
    });
    return {
      id: r.id,
      company_name: r.company_name,
      rep_name: r.rep_name,
      email: r.billing_email || r.advertiser_email,
      publication: r.publication,
      channel,
      ad_size: r.ad_size,
      frequency: r.frequency,
      rate_cents: r.ad_rate_cents,
      new_rate_cents: price.rateCents,
      exp_date: exp,
      days_left: daysUntil(exp),
      needs_full_form: channel !== 'print' || (r.line_count ?? 0) > 0,
      state,
      renewal_id: child?.id ?? null,
      last_sent_at: sent.length ? sent[sent.length - 1].timestamp : null,
      reminders_sent: reminders.length,
    };
  });
}

/** Create (or reuse) the renewal draft linked to a prior agreement. */
export async function ensureRenewalDraft(
  sql: Sql,
  priorId: string,
  adminEmail: string | null,
): Promise<{ renewalId: string; created: boolean }> {
  const existing = await sql`
    SELECT id FROM agreements
     WHERE renewed_from_id = ${priorId} AND status IN ('draft', 'sent')
     ORDER BY created_at DESC LIMIT 1
  ` as unknown as Array<{ id: string }>;
  if (existing.length) return { renewalId: existing[0].id, created: false };

  const priorRows = await sql`SELECT * FROM agreements WHERE id = ${priorId}` as unknown as PriorRow[];
  const prior = priorRows[0];
  if (!prior) throw new Error('prior agreement not found');

  const price = computeRenewalPrice({
    ad_rate_cents: prior.ad_rate_cents,
    frequency: prior.frequency,
    ad_size: prior.ad_size,
    exp_date: dateOnly(prior.exp_date),
    end_date: dateOnly(prior.end_date),
  });
  const term = computeNextTerm(dateOnly(prior.exp_date ?? prior.end_date), freqMonths(prior.frequency));
  const rate = price.rateCents;
  const months = freqMonths(prior.frequency);
  const amount = rate != null ? rate * months : prior.amount_cents;
  const repricedNote = price.repriced
    ? ` Rate updated from $${((price.priorRateCents ?? 0) / 100).toFixed(2)} to $${((rate ?? 0) / 100).toFixed(2)}${price.capped ? ' (15% cap applied)' : ''}.`
    : '';
  const now = new Date().toISOString();
  const audit = appendAudit([], {
    event: 'renewal_v2_draft_created',
    timestamp: now,
    user_email: adminEmail ?? undefined,
    details: `Renewals (Beta) draft created from agreement ${priorId}.${repricedNote}`,
  });

  const rows = await sql`
    INSERT INTO agreements (
      advertiser_id, company_name, rep_name, advertiser_email, advertiser_phone, advertiser_address,
      address, city, state, zip, type, status, start_date, end_date, exp_date,
      ad_size, frequency, ad_rate_cents, amount_cents, payment_mode, page_position,
      discount_cents, ad_premium_cents, total_monthly_rate_cents,
      bill_to, billing_email, billing_contact_name, billing_contact_phone,
      card_type, cardholder_name, card_number_last4, card_expiration, cardholder_address,
      stripe_customer_id, stripe_payment_method_id, publication, channel,
      ad_timing_months, is_renewal, renewed_from_id, notes, created_by, audit_log
    ) VALUES (
      ${prior.advertiser_id}, ${prior.company_name}, ${prior.rep_name}, ${prior.advertiser_email}, ${prior.advertiser_phone}, ${prior.advertiser_address},
      ${prior.address}, ${prior.city}, ${prior.state}, ${prior.zip}, ${prior.type}, 'draft', ${term.start}, ${term.end}, ${term.end},
      ${prior.ad_size}, ${prior.frequency}, ${rate}, ${amount}, ${prior.payment_mode}, ${prior.page_position},
      ${prior.discount_cents}, ${prior.ad_premium_cents}, ${rate},
      ${prior.bill_to}, ${prior.billing_email}, ${prior.billing_contact_name}, ${prior.billing_contact_phone},
      ${prior.card_type}, ${prior.cardholder_name}, ${prior.card_number_last4}, ${prior.card_expiration}, ${prior.cardholder_address},
      ${prior.stripe_customer_id}, ${prior.stripe_payment_method_id}, ${prior.publication}, ${channelOf(prior)},
      ${JSON.stringify(term.months)}::jsonb, true, ${priorId}, ${`Renewals (Beta): renewal of ${priorId}.${repricedNote}`}, ${adminEmail},
      ${JSON.stringify(audit)}::jsonb
    )
    RETURNING id
  ` as unknown as Array<{ id: string }>;
  return { renewalId: rows[0].id, created: true };
}

export function renewalLink(renewalId: string): string {
  return `${SITE_URL}/renew/${signToken(renewalId, 60 * 60 * 24 * 60)}`;
}

export async function recordEvent(
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

function humanDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function renewalEmailHtml(params: {
  ag: Agreement;
  link: string;
  daysLeft: number | null;
  reminderStage?: number;
  rateLock: boolean;
  intro?: string | null;
}): string {
  const { ag, link } = params;
  const brand = brandForPublication(ag.publication);
  const exp = dateOnly(ag.start_date);
  const lead = params.reminderStage
    ? `This is a friendly reminder that your renewal is still waiting for your approval.`
    : renderIntro(params.intro || 'Your advertising agreement is coming up for renewal. We pre-filled everything, so renewing takes about a minute.', ag);
  const lock = params.rateLock && ag.renewal_offer_expires_at
    ? `<p style="margin:16px 0 0 0;font-size:13px;color:#4A4757">Your renewal rate is held for 72 hours, until ${escapeHtml(new Date(ag.renewal_offer_expires_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' }))} Central.</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F6F5FB;font-family:Arial,Helvetica,sans-serif;color:#1B1726">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #E6E5EC;border-radius:12px">
<tr><td style="background:${brand.brandColor};color:#fff;padding:18px 28px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${escapeHtml(brand.brandName)}</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px 0;font-size:16px">Hi ${escapeHtml(ag.rep_name ?? 'there')},</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55">${lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5FB;border-radius:8px"><tr><td style="padding:16px 18px;font-size:14px;line-height:1.7">
<strong>${escapeHtml(ag.company_name ?? '')}</strong><br>
${ag.ad_size ? `Ad size: ${escapeHtml(ag.ad_size)}<br>` : ''}${ag.frequency ? `Frequency: ${escapeHtml(ag.frequency)}<br>` : ''}Monthly rate: ${money(ag.ad_rate_cents)}<br>${exp ? `Starts: ${escapeHtml(humanDate(exp))}` : ''}
</td></tr></table>
${lock}
<p style="margin:24px 0;text-align:center"><a href="${link}" style="display:inline-block;background:${brand.brandColor};color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:999px">Review &amp; Renew</a></p>
<p style="margin:0;font-size:12px;color:#6B6878">Questions? Just reply to this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export async function sendRenewalEmail(
  sql: Sql,
  renewalId: string,
  opts: { adminEmail?: string | null; to?: string | null; rateLock?: boolean; rateLockHours?: number; reminderStage?: number },
): Promise<{ ok: boolean; to?: string; error?: string; messageId?: string }> {
  const rows = await sql`SELECT * FROM agreements WHERE id = ${renewalId}` as unknown as Agreement[];
  let ag = rows[0];
  if (!ag) return { ok: false, error: 'renewal not found' };
  const to = opts.to || ag.billing_email || ag.advertiser_email;
  if (!to) return { ok: false, error: 'no email address on file' };

  const rateLock = opts.rateLock !== false;
  if (!opts.reminderStage && rateLock) {
    const hours = typeof opts.rateLockHours === 'number' && opts.rateLockHours >= 0 && opts.rateLockHours <= 720
      ? opts.rateLockHours
      : null;
    const deadline = (hours == null
      ? renewalOfferDeadline()
      : new Date(Date.now() + hours * 3600_000)).toISOString();
    await sql`UPDATE agreements SET renewal_offer_expires_at = ${deadline}, updated_at = NOW() WHERE id = ${renewalId}`;
    ag = { ...ag, renewal_offer_expires_at: deadline };
  }
  const link = renewalLink(renewalId);
  const html = renewalEmailHtml({ ag, link, daysLeft: null, reminderStage: opts.reminderStage, rateLock, intro: (await getDefaults(sql)).intro_renewal });
  const subject = opts.reminderStage
    ? `Reminder: renew your advertising agreement, ${ag.company_name ?? ''}`.trim()
    : `Renew your advertising agreement, ${ag.company_name ?? ''}`.trim();
  const result = await sendEmail({ to, subject, html });
  if (!result.ok) return { ok: false, to, error: result.error };

  if (opts.reminderStage) {
    await recordEvent(sql, renewalId, 'renewal_v2_reminder', `Reminder T-${opts.reminderStage} sent to ${to}`, opts.adminEmail);
  } else {
    await sql`UPDATE agreements SET status = 'sent', sent_to_email = ${to}, updated_at = NOW() WHERE id = ${renewalId}`;
    await recordEvent(sql, renewalId, 'renewal_v2_sent', `One-tap renewal link sent to ${to}. Message ${result.messageId ?? 'n/a'}`, opts.adminEmail);
  }
  return { ok: true, to, messageId: result.messageId };
}

export type ReminderResult = { id: string; company: string | null; stage?: number; status: string; error?: string };

/**
 * Reminds partners who were sent a one-tap renewal link but have not signed,
 * at T-7, T-3 and T-1 days before the expiring agreement ends. Each stage is
 * sent at most once per renewal.
 */
export async function runReminderSweep(
  sql: Sql,
  opts: { dry?: boolean } = {},
): Promise<{ results: ReminderResult[]; sent: number }> {
  const rows = await sql`
    SELECT r.id, r.audit_log, p.company_name,
           (COALESCE(p.exp_date, p.end_date)::date - CURRENT_DATE)::int AS days_left
      FROM agreements r
      JOIN agreements p ON p.id = r.renewed_from_id
     WHERE r.is_renewal = true
       AND r.status = 'sent'
       AND r.signed_at IS NULL
       AND COALESCE(p.exp_date, p.end_date) IS NOT NULL
       AND (COALESCE(p.exp_date, p.end_date)::date - CURRENT_DATE) BETWEEN 0 AND ${REMINDER_STAGES[0]}
  ` as unknown as Array<{ id: string; audit_log: AgreementAuditEntry[] | null; company_name: string | null; days_left: number }>;

  const results: ReminderResult[] = [];
  for (const r of rows) {
    const log = Array.isArray(r.audit_log) ? r.audit_log : [];
    if (!log.some((e) => e.event === 'renewal_v2_sent')) continue;
    const done = new Set(
      log.filter((e) => e.event === 'renewal_v2_reminder')
        .map((e) => Number(/T-(\d+)/.exec(e.details ?? '')?.[1])),
    );
    const reached = REMINDER_STAGES.filter((s) => r.days_left <= s);
    const stage = reached.length ? Math.min(...reached) : undefined;
    if (stage == null || done.has(stage)) continue;
    if (opts.dry) { results.push({ id: r.id, company: r.company_name, stage, status: 'would_send' }); continue; }
    const out = await sendRenewalEmail(sql, r.id, { reminderStage: stage });
    results.push({ id: r.id, company: r.company_name, stage, status: out.ok ? 'sent' : 'failed', error: out.error });
  }
  return { results, sent: results.filter((x) => x.status === 'sent').length };
}
