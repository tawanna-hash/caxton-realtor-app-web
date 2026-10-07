import { randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';
import { smsAllowedFor } from '@/lib/server/agent-deadline-notifications';
import { consentState, recordConsent, sendOptInRequest, sendSms, toE164, type ConsentState } from '@/lib/server/sms';
import { sendEmail } from '@/lib/email';
import { DEFAULT_EMAIL_SENDER } from '@/lib/email-sender';
import { requireDeal } from '@/lib/server/closing-time-assist';
import { logDealEvent } from '@/lib/server/closing-time-events';

/** Texts between the agent and the people on a deal. Sent on the owner's Telnyx account, so owner-only for now. */
export const DEAL_TEXT_AUDIENCE = 'closing-time-deal';

export const CONTACT_SCOPE = 'contact';
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
    for (const [t, cols] of [
      ['closing_time_emails', ['realtor_id UUID', 'deal_id TEXT', 'person_name TEXT', 'to_email TEXT', 'subject TEXT', 'body TEXT', 'status TEXT', 'error TEXT', 'created_at TIMESTAMPTZ DEFAULT NOW()']],
      ['closing_time_texts', ['realtor_id UUID', 'deal_id TEXT', 'person_name TEXT', 'phone TEXT', 'direction TEXT', 'body TEXT', 'status TEXT', 'telnyx_id TEXT', 'error TEXT', 'created_at TIMESTAMPTZ DEFAULT NOW()']],
    ] as const) for (const c of cols) await query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c}`);
    await query(`ALTER TABLE closing_time_emails ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound', ADD COLUMN IF NOT EXISTS external_id TEXT`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS closing_time_emails_ext_idx ON closing_time_emails (realtor_id, external_id) WHERE external_id IS NOT NULL`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_contact_activity (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL, person_key TEXT NOT NULL, person_name TEXT NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_contact_activity_idx ON closing_time_contact_activity (realtor_id, person_key, created_at DESC)`);
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

/** Records an event in the deal's Audit Trail feed (unless it is a contact-only message) and in the person's own activity log. */
export async function note(realtorId: string, dealId: string, personName: string, kind: string, message: string): Promise<void> {
  if (dealId !== CONTACT_SCOPE) await logDealEvent(realtorId, dealId, kind, message);
  try {
    await ensure();
    await query(`INSERT INTO closing_time_contact_activity (id, realtor_id, person_key, person_name, message) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), realtorId, personName.trim().toLowerCase(), personName.slice(0, 200), message.slice(0, 560)]);
  } catch { /* ignore */ }
}
const LOCKED_MESSAGE = 'This deal is closed and its record is locked. Messaging has stopped; the history is kept for the audit record.';
async function isLocked(realtorId: string, dealId: string): Promise<boolean> {
  try { return (await requireDeal(realtorId, dealId)).auditLocked === true; } catch { return false; }
}
export { LOCKED_MESSAGE, isLocked };

const STOP_LINE = ' Reply STOP to opt out.';

async function store(realtorId: string, dealId: string, name: string, phone: string, body: string, status: string, telnyxId: string | null, error: string | null) {
  await ensure();
  await query(`INSERT INTO closing_time_texts (id, realtor_id, deal_id, person_name, phone, direction, body, status, telnyx_id, error) VALUES ($1,$2,$3,$4,$5,'outbound',$6,$7,$8,$9)`,
    [randomUUID(), realtorId, dealId, name.slice(0, 200), phone, body.slice(0, 1600), status, telnyxId, error]);
}

type Sender = { realtorId: string; email: string };

/** Asks one person to agree to texts. The only text that goes out without prior consent. */
export async function sendDealOptIn(s: Sender, dealId: string, property: string, agentName: string, p: { name: string; phone: string }): Promise<{ ok: boolean; error?: string }> {
  if (await isLocked(s.realtorId, dealId)) return { ok: false, error: LOCKED_MESSAGE };
  if (!smsAllowedFor(s.email)) return { ok: false, error: 'Texting is not available for this account yet.' };
  const phone = toE164(p.phone);
  if (!phone) return { ok: false, error: 'Add a valid mobile number first.' };
  const body = `${property}: ${agentName || 'Your agent'} would like to text you updates about this deal. Reply YES to agree.${STOP_LINE} Msg and data rates may apply.`;
  const r = await sendOptInRequest(DEAL_TEXT_AUDIENCE, body, phone);
  await store(s.realtorId, dealId, p.name, phone, body, r.ok ? 'queued' : 'failed', r.id ?? null, r.ok ? null : (r.error ?? 'failed'));
  await note(s.realtorId, dealId, p.name, 'text', r.ok ? `Text sent to ${p.name} (${phone}): request to agree to text updates` : `Text to ${p.name} (${phone}) could not be sent: ${r.error}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** The agent confirms the person already agreed to texts (in person, by email, or in the contract). */
export async function attestDealConsent(s: Sender, dealId: string, p: { name: string; phone: string }): Promise<{ ok: boolean; error?: string }> {
  if (!smsAllowedFor(s.email)) return { ok: false, error: 'Texting is not available for this account yet.' };
  const phone = toE164(p.phone);
  if (!phone) return { ok: false, error: 'Add a valid mobile number first.' };
  await recordConsent(phone, DEAL_TEXT_AUDIENCE, `agent-attested:${s.email}`);
  await note(s.realtorId, dealId, p.name, 'text', `Agent confirmed ${p.name} (${phone}) agreed to receive texts`);
  return { ok: true };
}

export async function sendDealText(s: Sender, dealId: string, property: string, p: { name: string; phone: string; body: string; requests?: { label: string }[] }, origin = ''): Promise<{ ok: boolean; error?: string }> {
  if (await isLocked(s.realtorId, dealId)) return { ok: false, error: LOCKED_MESSAGE };
  if (!smsAllowedFor(s.email)) return { ok: false, error: 'Texting is not available for this account yet.' };
  const phone = toE164(p.phone);
  if (!phone) return { ok: false, error: 'Add a valid mobile number first.' };
  const asks = dealId === CONTACT_SCOPE ? [] : (p.requests ?? []).filter((r) => r.label.trim());
  const made: string[] = [];
  let ask = '';
  if (asks.length) {
    const { createDocRequest, setPortalLink } = await import('@/lib/server/closing-time-assist');
    for (const r of asks) made.push(await createDocRequest(s.realtorId, dealId, { label: r.label.trim(), note: '', personName: p.name }));
    const token = await setPortalLink(s.realtorId, dealId, p.name, {});
    ask = ` Please provide: ${asks.map((r) => r.label.trim()).join('; ')}.${token && origin ? ` Upload here: ${origin}/deal-portal/${token}` : ''}`;
  }
  const body = `${property}: ${p.body.trim().slice(0, 900)}${ask}${STOP_LINE}`; // for contact messages the caller passes the agent's name here
  let result;
  try { result = await sendSms(DEAL_TEXT_AUDIENCE, body, [phone]); } catch (e) {
    const { setDocRequestStatus } = await import('@/lib/server/closing-time-assist');
    for (const id of made) await setDocRequestStatus(s.realtorId, id, 'cancelled').catch(() => undefined);
    return { ok: false, error: e instanceof Error ? e.message : 'Text failed' };
  }
  if (!result.sent.length && made.length) {
    const { setDocRequestStatus } = await import('@/lib/server/closing-time-assist');
    for (const id of made) await setDocRequestStatus(s.realtorId, id, 'cancelled').catch(() => undefined);
  }
  if (result.sent.length) {
    if (made.length) { const { markDocRequestEmailed } = await import('@/lib/server/closing-time-assist'); for (const id of made) await markDocRequestEmailed(s.realtorId, id).catch(() => undefined); }
    await store(s.realtorId, dealId, p.name, phone, body, 'queued', result.sent[0].id, null);
    await note(s.realtorId, dealId, p.name, 'text', `Text sent to ${p.name} (${phone}): ${p.body.trim().slice(0, 200)}`);
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
    // Once the deal is closed and locked its record stays unchanged; later replies go to the person's contact thread instead.
    const target = (await isLocked(l.realtor_id, l.deal_id)) ? CONTACT_SCOPE : l.deal_id;
    await query(`INSERT INTO closing_time_texts (id, realtor_id, deal_id, person_name, phone, direction, body, status, telnyx_id) VALUES ($1,$2,$3,$4,$5,'inbound',$6,'received',$7)`, [randomUUID(), l.realtor_id, target, l.person_name, phone, body.slice(0, 1600), telnyxId]);
    await note(l.realtor_id, target, l.person_name, 'text', `Text received from ${l.person_name} (${phone}): ${body.slice(0, 200)}`);
  } catch { /* ignore */ }
}

export async function updateTextStatus(telnyxId: string | null, status: string, error: string | null): Promise<void> {
  if (!telnyxId) return;
  try { await ensure(); await query(`UPDATE closing_time_texts SET status=$2, error=$3 WHERE telnyx_id=$1 AND direction='outbound'`, [telnyxId, status, error]); } catch { /* ignore */ }
}

export type DealEmail = { direction: 'outbound' | 'inbound'; id: string; personName: string; toEmail: string; subject: string; body: string; status: string; error: string | null; createdAt: string };

export async function listDealEmails(realtorId: string, dealId: string): Promise<DealEmail[]> {
  await ensure();
  const rows = await query<{ id: string; direction: string; person_name: string; to_email: string; subject: string; body: string; status: string; error: string | null; created_at: Date | string }>(
    `SELECT id, direction, person_name, to_email, subject, body, status, error, created_at FROM closing_time_emails WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at ASC LIMIT 300`, [realtorId, dealId]);
  return rows.map((r) => ({ direction: r.direction as DealEmail['direction'], id: r.id, personName: r.person_name, toEmail: r.to_email, subject: r.subject, body: r.body, status: r.status, error: r.error, createdAt: new Date(r.created_at).toISOString() }));
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** Emails from the deal's Messages tab. Replies go to the agent's own email; they are not threaded back here. */
export async function sendDealEmail(realtorId: string, dealId: string, property: string, agent: { name: string; email: string }, input: { to: { name: string; email: string }[]; subject: string; body: string; cc?: string[]; requests?: { label: string; note?: string }[]; attachments?: { filename: string; content: string; contentType?: string }[] }, origin = ''): Promise<{ ok: boolean; sent: number; error?: string; requested?: number }> {
  if (await isLocked(realtorId, dealId)) return { ok: false, sent: 0, error: LOCKED_MESSAGE };
  await ensure();
  const bare = input.subject.trim();
  // Every deal email starts with the property address.
  const subject = (dealId === CONTACT_SCOPE || bare.toLowerCase().startsWith(property.toLowerCase()) ? bare : `${property} - ${bare}`).slice(0, 200);
  const { getAgentAccountDetails } = await import('@/lib/server/agent-account-details');
  const details = await getAgentAccountDetails(realtorId).catch(() => null);
  const clean = (v: string) => v.replace(/[<>\"\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  const senderName = [clean(agent.name || ''), clean(details?.brokerage ?? '')].filter(Boolean).join(' / ');
  const from = senderName ? `"${senderName}" <${DEFAULT_EMAIL_SENDER}>` : undefined;
  const ccList = Array.from(new Set([agent.email, ...(input.cc ?? [])].map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean)));
  let sent = 0; let lastError = '';
  let requested = 0;
  for (const to of input.to) {
    let text = input.body;
    const asks = dealId === CONTACT_SCOPE ? [] : (input.requests ?? []).filter((r) => r.label.trim());
    const made: string[] = [];
    if (asks.length) {
      const { createDocRequest, setPortalLink, markDocRequestEmailed } = await import('@/lib/server/closing-time-assist');
      for (const r of asks) made.push(await createDocRequest(realtorId, dealId, { label: r.label.trim(), note: (r.note ?? '').trim(), personName: to.name }));
      const token = await setPortalLink(realtorId, dealId, to.name, {});
      text += `\n\nPlease provide:\n${asks.map((r) => `- ${r.label.trim()}${r.note?.trim() ? ` (${r.note.trim()})` : ''}`).join('\n')}${token && origin ? `\n\nUpload here: ${origin}/deal-portal/${token}` : ''}`;
      requested += made.length;
      for (const id of made) await markDocRequestEmailed(realtorId, id).catch(() => undefined);
    }
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:600px">${text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}${dealId === CONTACT_SCOPE ? '' : `<p style="color:#4A4757;font-size:12px">Regarding ${esc(property)}</p>`}</div>`;
    const r = await sendEmail({ to: to.email, cc: ccList.filter((c) => c !== to.email.toLowerCase()), ...(from ? { from } : {}), replyTo: agent.email || undefined, subject, html, ...(input.attachments?.length ? { attachments: input.attachments } : {}) }).catch((e) => ({ ok: false, error: String(e) }));
    const ok = (r as { ok?: boolean }).ok !== false;
    if (!ok) lastError = (r as { error?: string }).error ?? 'Send failed';
    if (input.attachments?.length) text += `\n\nAttached: ${input.attachments.map((a) => a.filename).join(', ')}`;
    await query(`INSERT INTO closing_time_emails (id, realtor_id, deal_id, person_name, to_email, subject, body, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), realtorId, dealId, to.name.slice(0, 200), to.email, subject, text.slice(0, 10000), ok ? 'sent' : 'failed', ok ? null : lastError]);
    await note(realtorId, dealId, to.name, 'email', ok ? `Email sent to ${to.name} <${to.email}>: ${subject}` : `Email to ${to.name} <${to.email}> could not be sent: ${lastError}`);
    if (ok) sent += 1;
  }
  return sent ? { ok: true, sent, requested } : { ok: false, sent, error: lastError || 'Send failed' };
}

/** Everything exchanged with one person across all deals, including closed ones, plus messages sent from Contacts. */
export async function listContactMessages(realtorId: string, p: { name: string; email: string; phone: string }): Promise<{ texts: DealText[]; emails: DealEmail[] }> {
  await ensure();
  const phone = toE164(p.phone) ?? '';
  const name = p.name.trim().toLowerCase();
  const t = await query<{ id: string; person_name: string; phone: string; direction: string; body: string; status: string; error: string | null; created_at: Date | string }>(
    `SELECT id, person_name, phone, direction, body, status, error, created_at FROM closing_time_texts WHERE realtor_id=$1 AND (lower(person_name)=$2 OR ($3<>'' AND phone=$3)) ORDER BY created_at ASC LIMIT 500`, [realtorId, name, phone]);
  const e = await query<{ id: string; direction: string; person_name: string; to_email: string; subject: string; body: string; status: string; error: string | null; created_at: Date | string }>(
    `SELECT id, direction, person_name, to_email, subject, body, status, error, created_at FROM closing_time_emails WHERE realtor_id=$1 AND (lower(person_name)=$2 OR ($3<>'' AND lower(to_email)=$3)) ORDER BY created_at ASC LIMIT 300`, [realtorId, name, p.email.trim().toLowerCase()]);
  return {
    texts: t.map((r) => ({ id: r.id, personName: r.person_name, phone: r.phone, direction: r.direction as DealText['direction'], body: r.body, status: r.status, error: r.error, createdAt: new Date(r.created_at).toISOString() })),
    emails: e.map((r) => ({ direction: r.direction as DealEmail['direction'], id: r.id, personName: r.person_name, toEmail: r.to_email, subject: r.subject, body: r.body, status: r.status, error: r.error, createdAt: new Date(r.created_at).toISOString() })),
  };
}

export async function listContactActivity(realtorId: string, name: string): Promise<{ id: string; message: string; createdAt: string }[]> {
  await ensure();
  const rows = await query<{ id: string; message: string; created_at: Date | string }>(`SELECT id, message, created_at FROM closing_time_contact_activity WHERE realtor_id=$1 AND person_key=$2 ORDER BY created_at DESC LIMIT 200`, [realtorId, name.trim().toLowerCase()]);
  return rows.map((r) => ({ id: r.id, message: r.message, createdAt: new Date(r.created_at).toISOString() }));
}
