import { randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';
import { accountFor, proxyCall } from '@/lib/server/composio';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { MAIL_SLUGS } from '@/lib/server/closing-time-connected';
import { CONTACT_SCOPE, note } from '@/lib/server/closing-time-texts';

/**
 * Incoming email replies through the agent's own connected Gmail or Outlook.
 * Opt-in. Only mail FROM an address listed on one of the agent's deals is stored; everything else is skipped.
 * Replies for an open deal go to that deal's thread; for closed and locked deals they go to the person's contact thread.
 */
let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS closing_time_mailbox (
      realtor_id UUID PRIMARY KEY, read_replies BOOLEAN NOT NULL DEFAULT FALSE, last_checked TIMESTAMPTZ, last_error TEXT)`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export type MailboxState = { connected: string | null; readReplies: boolean; lastChecked: string | null; lastError: string | null };

export async function mailboxState(realtorId: string): Promise<MailboxState> {
  await ensure();
  const acct = await accountFor(realtorId, MAIL_SLUGS);
  const rows = await query<{ read_replies: boolean; last_checked: Date | string | null; last_error: string | null }>(`SELECT read_replies, last_checked, last_error FROM closing_time_mailbox WHERE realtor_id=$1`, [realtorId]);
  const r = rows[0];
  return { connected: acct ? (acct.appSlug === 'gmail' ? 'Gmail' : 'Outlook') : null, readReplies: r?.read_replies ?? false, lastChecked: r?.last_checked ? new Date(r.last_checked).toISOString() : null, lastError: r?.last_error ?? null };
}

export async function setReadReplies(realtorId: string, on: boolean): Promise<void> {
  await ensure();
  await query(`INSERT INTO closing_time_mailbox (realtor_id, read_replies) VALUES ($1,$2) ON CONFLICT (realtor_id) DO UPDATE SET read_replies=EXCLUDED.read_replies${on ? ', last_checked=NULL, last_error=NULL' : ''}`, [realtorId, on]);
}

type Target = { dealId: string; name: string };

/** address -> where its replies belong. Open deals win over locked ones; locked-only people go to their contact thread. */
async function addressBook(realtorId: string): Promise<Map<string, Target>> {
  const ws = await getAgentCommandCenterWorkspace(realtorId);
  const book = new Map<string, Target & { rank: string; open: boolean }>();
  for (const deal of ws?.workspace.deals ?? []) {
    const open = deal.auditLocked !== true;
    for (const c of deal.clientContacts ?? []) {
      const email = (c.email ?? '').trim().toLowerCase();
      if (!email || !c.name.trim()) continue;
      const cur = book.get(email);
      const better = !cur || (open && !cur.open) || (open === cur.open && deal.updatedAt > cur.rank);
      if (better) book.set(email, { dealId: open ? deal.id : CONTACT_SCOPE, name: c.name.trim(), rank: deal.updatedAt, open });
    }
  }
  return new Map(Array.from(book, ([k, v]) => [k, { dealId: v.dealId, name: v.name }]));
}

const b64 = (v: string) => Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
/** Keeps what the person wrote and drops the quoted earlier message. */
function trimQuoted(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (/^On .{5,200}wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From:\s.+@/.test(line) && out.length > 0) break;
    if (line.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim().slice(0, 5000);
}

type Found = { id: string; from: string; subject: string; body: string; at: string };

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
function gmailText(p: GmailPart | undefined): string {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return b64(p.body.data);
  for (const c of p.parts ?? []) { const t = gmailText(c); if (t) return t; }
  return '';
}

async function readGmail(realtorId: string, accountId: string, addrs: string[], sinceMs: number): Promise<Found[]> {
  const out: Found[] = [];
  for (let i = 0; i < addrs.length; i += 15) {
    const q = `from:(${addrs.slice(i, i + 15).join(' OR ')}) after:${Math.floor(sinceMs / 1000)}`;
    const list = await proxyCall(realtorId, accountId, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(q)}`, { method: 'GET' });
    if (!list.ok) throw new Error(list.status === 403 || list.status === 401 ? 'Gmail did not allow reading mail. Disconnect and reconnect Gmail in Integrations, then try again.' : `Gmail returned an error (${list.status}).`);
    const ids = ((list.data as { messages?: { id: string }[] })?.messages ?? []).map((m) => m.id);
    for (const id of ids) {
      const m = await proxyCall(realtorId, accountId, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { method: 'GET' });
      if (!m.ok) continue;
      const d = m.data as { id: string; internalDate?: string; snippet?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] } };
      const h = (n: string) => d.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? '';
      const from = /<([^>]+)>/.exec(h('from'))?.[1] ?? h('from');
      out.push({ id: d.id, from: from.trim().toLowerCase(), subject: h('subject') || '(No subject)', body: trimQuoted(gmailText(d.payload) || d.snippet || ''), at: new Date(Number(d.internalDate) || Date.now()).toISOString() });
    }
  }
  return out;
}

async function readOutlook(realtorId: string, accountId: string, sinceMs: number): Promise<Found[]> {
  const url = `https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc&$filter=${encodeURIComponent(`receivedDateTime ge ${new Date(sinceMs).toISOString()}`)}&$select=id,subject,from,receivedDateTime,body`;
  const res = await proxyCall(realtorId, accountId, url, { method: 'GET', headers: { Prefer: 'outlook.body-content-type="text"' } });
  if (!res.ok) throw new Error(res.status === 403 || res.status === 401 ? 'Outlook did not allow reading mail. Disconnect and reconnect Outlook in Integrations, then try again.' : `Outlook returned an error (${res.status}).`);
  type M = { id: string; subject?: string; from?: { emailAddress?: { address?: string } }; receivedDateTime?: string; body?: { content?: string } };
  return ((res.data as { value?: M[] })?.value ?? []).map((m) => ({ id: m.id, from: (m.from?.emailAddress?.address ?? '').toLowerCase(), subject: m.subject || '(No subject)', body: trimQuoted(m.body?.content ?? ''), at: m.receivedDateTime ?? new Date().toISOString() }));
}

export async function syncMailboxReplies(realtorId: string, force = false): Promise<{ stored: number; skipped?: string; error?: string }> {
  await ensure();
  const rows = await query<{ read_replies: boolean; last_checked: Date | string | null }>(`SELECT read_replies, last_checked FROM closing_time_mailbox WHERE realtor_id=$1`, [realtorId]);
  const st = rows[0];
  if (!st?.read_replies) return { stored: 0, skipped: 'off' };
  const last = st.last_checked ? new Date(st.last_checked).getTime() : 0;
  if (!force && Date.now() - last < 60_000) return { stored: 0, skipped: 'recent' };
  const acct = await accountFor(realtorId, MAIL_SLUGS);
  if (!acct) return { stored: 0, skipped: 'no mailbox' };
  try {
    const book = await addressBook(realtorId);
    const addrs = Array.from(book.keys());
    let stored = 0;
    if (addrs.length) {
      const since = Math.max(last ? last - 10 * 60_000 : Date.now() - 7 * 86_400_000, Date.now() - 14 * 86_400_000);
      const found = acct.appSlug === 'gmail' ? await readGmail(realtorId, acct.id, addrs, since) : await readOutlook(realtorId, acct.id, since);
      for (const m of found) {
        const t = book.get(m.from);
        if (!t) continue; // not a person on a deal: never stored
        const ins = await query(`INSERT INTO closing_time_emails (id, realtor_id, deal_id, person_name, to_email, subject, body, status, direction, external_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'received','inbound',$8,$9) ON CONFLICT DO NOTHING RETURNING id`,
          [randomUUID(), realtorId, t.dealId, t.name, m.from, m.subject.slice(0, 200), m.body || '(No text)', `${acct.appSlug}:${m.id}`, m.at]);
        if (ins[0]) { stored += 1; await note(realtorId, t.dealId, t.name, 'email', `Email reply received from ${t.name} <${m.from}>: ${m.subject.slice(0, 160)}`); }
      }
    }
    await query(`UPDATE closing_time_mailbox SET last_checked=NOW(), last_error=NULL WHERE realtor_id=$1`, [realtorId]);
    return { stored };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Could not read the mailbox';
    await query(`UPDATE closing_time_mailbox SET last_checked=NOW(), last_error=$2 WHERE realtor_id=$1`, [realtorId, error.slice(0, 300)]);
    return { stored: 0, error };
  }
}

export async function syncAllMailboxes(): Promise<{ checked: number; stored: number; errors: string[] }> {
  await ensure();
  const rows = await query<{ realtor_id: string }>(`SELECT realtor_id FROM closing_time_mailbox WHERE read_replies=TRUE`);
  const out = { checked: 0, stored: 0, errors: [] as string[] };
  for (const r of rows) {
    const res = await syncMailboxReplies(r.realtor_id, true);
    out.checked += 1; out.stored += res.stored;
    if (res.error) out.errors.push(res.error);
  }
  return out;
}
