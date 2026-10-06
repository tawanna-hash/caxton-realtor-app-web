import { randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';
import { smsAllowedFor } from '@/lib/server/agent-deadline-notifications';
import { consentState, recordConsent, sendOptInRequest, sendSms, toE164, type ConsentState } from '@/lib/server/sms';
import { sendEmail } from '@/lib/email';
import { logDealEvent } from '@/lib/server/closing-time-events';

/** Texts between the agent and the people on a deal. Sent on the owner's Telnyx account, so owner-only for now. */
export const DEAL_TEXT_AUDIENCE = 'closing-time-deal';

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS closing_time_texts (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, person_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL,
      direction TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', telnyx_id TEXT, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_emails (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, person_name TEXT NOT NULL DEFAULT '', to_email TEXT NOT NULL,
      subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent', error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_emails_deal_idx ON closing_time_emails (realtor_id, deal_id, created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_texts_deal_idx ON closing_time_texts (realtor_id, deal_id, created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_texts_phone_idx ON closing_time_texts (phone, created_at DESC)`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export type DealText = { id: string; personName: string; phone: string; direction: 'outbound' | 'inbound'; body: string; status: string; error: string | null; createdAt: string };

export async function listDealTexts(realtorId: string, dealId: string): Promise<DealText[]> {
  await ensure();
  const rows = await query<{ id: string; person_name: string; phone: string; direction: string; body: string; status: string; error: string | null; created_at: Date | string }>(
    `SELECT id, person_name, phone, direction, body, status, error, created_at FROM closing_time_texts WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at ASC LIMIT 500`, [realtorId, dealId]);
  return rows.map((r) => ({ id: r.id, personName: r.person_name, phone: r.phone, direction: r.direction as DealText['direction'], body: r.body, status: r.status, error: r.error, createdAt: new Date(r.created_at).toISOString() }));
}

export async function consentFor(phones: string[]): Promise<Record<string, ConsentState>> {
  const out: Record<string, ConsentState> = {};
  for (const p of phones.slice(0, 40)) { const e = toE164(p); if (e) out[e] = await consentState(DEAL_TEXT_AUDIENCE, e); }
  return out;
}

const STOP_LINE = ' Reply STOP to opt out.';

async function store(realtorId: string, dealId: string, name: string, phone: string, body: string, status: string, telnyxId: string | null, error: string | null) {
  await ensure();
  await query(`INSERT INTO closing_time_texts (id, realtor_id, deal_id, person_name, phone, direction, body, status, telnyx_id, error) VALUES ($1,$2,$3,$4,$5,'outbound',$6,$7,$8,$9)`,
    [randomUUID(), realtorId, dealId, name.slice(0, 200), phone, body.slice(0, 1600), status, telnyxId, error]);
}

type Sender = { realtorId: string; email: string };

/** Asks one person to agree to texts. The only text that goes out without prior consent. */
export async function sendDealOptIn(s: Sender, dealId: string, property: string, agentName: string, p: { name: string; phone: string }): Promise<{ ok: boolean; error?: string }> {
  if (!smsAllowedFor(s.email)) return { ok: false, error: 'Texting is not available for this account yet.' };
  const phone = toE164(p.phone);
  if (!phone) return { ok: false, error: 'Add a valid mobile number first.' };
  const body = `${property}: ${agentName || 'Your agent'} would like to text you updates about this deal. Reply YES to agree.${STOP_LINE} Msg and data rates may apply.`;
  const r = await sendOptInRequest(DEAL_TEXT_AUDIENCE, body, phone);
  await store(s.realtorId, dealId, p.name, phone, body, r.ok ? 'queued' : 'failed', r.id ?? null, r.ok ? null : (r.error ?? 'failed'));
  await logDealEvent(s.realtorId, dealId, 'text', r.ok ? `Text sent to ${p.name} (${phone}): request to agree to text updates` : `Text to ${p.name} (${phone}) could not be sent: ${r.error}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** The agent confirms the person already agreed to texts (in person, by email, or in the contract). */
export async function attestDealConsent(s: Sender, dealId: string, p: { name: string; phone: string }): Promise<{ ok: boolean; error?: string }> {
  if (!smsAllowedFor(s.email)) return { ok: false, error: 'Texting is not available for this account yet.' };
  const phone = toE164(p.phone);
  if (!phone) return { ok: false, error: 'Add a valid mobile number first.' };
  await recordConsent(phone, DEAL_TEXT_AUDIENCE, `agent-attested:${s.email}`);
  await logDealEvent(s.realtorId, dealId, 'text', `Agent confirmed ${p.name} (${phone}) agreed to receive texts`);
  return { ok: true };
}

export async function sendDealText(s: Sender, dealId: string, property: string, p: { name: string; phone: string; body: string }): Promise<{ ok: boolean; error?: string }> {
  if (!smsAllowedFor(s.email)) return { ok: false, error: 'Texting is not available for this account yet.' };
  const phone = toE164(p.phone);
  if (!phone) return { ok: false, error: 'Add a valid mobile number first.' };
  const body = `${property}: ${p.body.trim().slice(0, 900)}${STOP_LINE}`;
  let result;
  try { result = await sendSms(DEAL_TEXT_AUDIENCE, body, [phone]); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Text failed' }; }
  if (result.sent.length) {
    await store(s.realtorId, dealId, p.name, phone, body, 'queued', result.sent[0].id, null);
    await logDealEvent(s.realtorId, dealId, 'text', `Text sent to ${p.name} (${phone}): ${p.body.trim().slice(0, 200)}`);
    return { ok: true };
  }
  const reason = result.skipped[0]?.reason;
  const error = reason === 'no_consent' ? 'This person has not agreed to texts yet. Send the opt-in request or confirm they agreed.' : reason === 'opted_out' ? 'This person opted out of texts.' : (result.failed[0]?.error ?? 'Not sent');
  return { ok: false, error };
}

/** Called by the Telnyx webhook: ties an inbound reply to the most recent deal text sent to that number. */
export async function attachInboundText(phone: string, body: string, telnyxId: string | null): Promise<void> {
  try {
    await ensure();
    const last = await query<{ realtor_id: string; deal_id: string; person_name: string }>(`SELECT realtor_id, deal_id, person_name FROM closing_time_texts WHERE phone=$1 AND direction='outbound' ORDER BY created_at DESC LIMIT 1`, [phone]);
    const l = last[0];
    if (!l) return;
    await query(`INSERT INTO closing_time_texts (id, realtor_id, deal_id, person_name, phone, direction, body, status, telnyx_id) VALUES ($1,$2,$3,$4,$5,'inbound',$6,'received',$7)`, [randomUUID(), l.realtor_id, l.deal_id, l.person_name, phone, body.slice(0, 1600), telnyxId]);
    await logDealEvent(l.realtor_id, l.deal_id, 'text', `Text received from ${l.person_name} (${phone}): ${body.slice(0, 200)}`);
  } catch { /* ignore */ }
}

export async function updateTextStatus(telnyxId: string | null, status: string, error: string | null): Promise<void> {
  if (!telnyxId) return;
  try { await ensure(); await query(`UPDATE closing_time_texts SET status=$2, error=$3 WHERE telnyx_id=$1 AND direction='outbound'`, [telnyxId, status, error]); } catch { /* ignore */ }
}

export type DealEmail = { id: string; personName: string; toEmail: string; subject: string; body: string; status: string; error: string | null; createdAt: string };

export async function listDealEmails(realtorId: string, dealId: string): Promise<DealEmail[]> {
  await ensure();
  const rows = await query<{ id: string; person_name: string; to_email: string; subject: string; body: string; status: string; error: string | null; created_at: Date | string }>(
    `SELECT id, person_name, to_email, subject, body, status, error, created_at FROM closing_time_emails WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at ASC LIMIT 300`, [realtorId, dealId]);
  return rows.map((r) => ({ id: r.id, personName: r.person_name, toEmail: r.to_email, subject: r.subject, body: r.body, status: r.status, error: r.error, createdAt: new Date(r.created_at).toISOString() }));
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** Emails from the deal's Messages tab. Replies go to the agent's own email; they are not threaded back here. */
export async function sendDealEmail(realtorId: string, dealId: string, property: string, agent: { name: string; email: string }, input: { to: { name: string; email: string }[]; subject: string; body: string }): Promise<{ ok: boolean; sent: number; error?: string }> {
  await ensure();
  const subject = (input.subject.includes(property) ? input.subject : `${input.subject} - ${property}`).slice(0, 200);
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:600px">${input.body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}<p style="color:#7A7787;font-size:12px">Regarding ${esc(property)}. Reply to this email to reach ${esc(agent.name || 'your agent')}.</p></div>`;
  let sent = 0; let lastError = '';
  for (const to of input.to) {
    const r = await sendEmail({ to: to.email, cc: agent.email || undefined, replyTo: agent.email || undefined, subject, html }).catch((e) => ({ ok: false, error: String(e) }));
    const ok = (r as { ok?: boolean }).ok !== false;
    if (!ok) lastError = (r as { error?: string }).error ?? 'Send failed';
    await query(`INSERT INTO closing_time_emails (id, realtor_id, deal_id, person_name, to_email, subject, body, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), realtorId, dealId, to.name.slice(0, 200), to.email, subject, input.body.slice(0, 10000), ok ? 'sent' : 'failed', ok ? null : lastError]);
    await logDealEvent(realtorId, dealId, 'email', ok ? `Email sent to ${to.name} <${to.email}>: ${subject}` : `Email to ${to.name} <${to.email}> could not be sent: ${lastError}`);
    if (ok) sent += 1;
  }
  return sent ? { ok: true, sent } : { ok: false, sent, error: lastError || 'Send failed' };
}
