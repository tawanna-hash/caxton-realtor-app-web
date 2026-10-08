import { randomUUID } from 'crypto';
import { agentCommandCenterWorkspaceSchema, type AgentDeal, type AgentCommandCenterWorkspace } from '@/lib/agent-command-center-workspace';
import { dealTimeline } from '@/lib/closing-time-risks';
import { CLOSING_TIME_ORIGIN } from '@/lib/closing-time-origin';
import { sendEmail } from '@/lib/email';
import { query } from '@/lib/server/db/neon';
import { ensureAssistSchema, setPortalLink } from '@/lib/server/closing-time-assist';
import { logDealEvent } from '@/lib/server/closing-time-events';
import { dispatchDealEvents } from '@/lib/server/closing-time-automation';

/**
 * Agent-controlled automations. Each one is off unless the agent turns it on
 * (the daily summary is the one exception and stays on until turned off).
 * Messages go only to people the agent added to the deal, copy the agent, and
 * never include price or terms.
 */

export const AUTOMATION_DEFS = [
  { key: 'docChase', title: 'Chase Missing Documents', defaultOn: false,
    detail: 'When a requested document is still missing after 3 days, email that person a reminder with their private upload link. Repeats every 3 days, up to 3 reminders, then tells you to follow up yourself.' },
  { key: 'weeklyUpdate', title: 'Weekly Client Update', defaultOn: false,
    detail: 'Every Monday morning, email each client on an active deal what is next on the calendar and which requested documents are still outstanding.' },
  { key: 'deadlineMoves', title: 'Deadline Moves', defaultOn: false,
    detail: 'When you change a closing date, email everyone on the deal the new date. Dates, reminders and calendar events built from the closing date update on their own.' },
  { key: 'closingDay', title: 'Closing-Day Checklist', defaultOn: false,
    detail: 'Three days before closing, email the client and the title company a closing-day checklist: final walkthrough, utilities, funds and keys.' },
  { key: 'postClose', title: 'Post-Close Follow-Up', defaultOn: false,
    detail: 'The day after a deal closes, email the client a thank-you and a request for a referral or review.' },
  { key: 'dailyDigest', title: 'Daily Summary Email', defaultOn: true,
    detail: 'At 6 PM Central, one email listing the risks, next dates and follow-up drafts waiting on every active deal.' },
  { key: 'zapierEvents', title: 'Zapier Closing-Soon Trigger', defaultOn: false,
    detail: 'Three days before closing, send a Closing Soon event to your connected webhooks and Zapier, so your own CRM can react. Set up webhooks below.' },
  { key: 'titleHandoff', title: 'Title Company Handoff', defaultOn: false,
    detail: 'Seven days before closing, email the title company a summary of the deal: property, key dates and the contacts on the deal. No documents or price are attached.' },
] as const;
export type AutomationKey = typeof AUTOMATION_DEFS[number]['key'];
export type AutomationState = Record<AutomationKey, boolean>;

let ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await ensureAssistSchema();
    await query(`ALTER TABLE closing_time_settings ADD COLUMN IF NOT EXISTS automations JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_automation_log (
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, deal_id, kind, ref))`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

function merge(raw: unknown): AutomationState {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(AUTOMATION_DEFS.map((d) => [d.key, typeof obj[d.key] === 'boolean' ? obj[d.key] : d.defaultOn])) as AutomationState;
}

export async function getAutomations(realtorId: string): Promise<AutomationState> {
  await ensureSchema();
  const r = await query<{ automations: unknown }>(`SELECT automations FROM closing_time_settings WHERE realtor_id=$1`, [realtorId]);
  return merge(r[0]?.automations);
}

export async function setAutomation(realtorId: string, key: AutomationKey, on: boolean): Promise<AutomationState> {
  await ensureSchema();
  await query(`INSERT INTO closing_time_settings (realtor_id, automations) VALUES ($1, jsonb_build_object($2::text, $3::boolean))
    ON CONFLICT (realtor_id) DO UPDATE SET automations = COALESCE(closing_time_settings.automations,'{}'::jsonb) || jsonb_build_object($2::text, $3::boolean), updated_at=NOW()`, [realtorId, key, on]);
  return getAutomations(realtorId);
}

// ---- shared helpers ----
const DAY = 86_400_000;
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const html = (text: string) => `<div style="font-family:Inter,Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:600px">${esc(text).replace(/\n/g, '<br>')}</div>`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);
const propertyOf = (d: AgentDeal) => (d.propertyAddress || '').trim() || `${d.title || 'Deal'} (address not entered)`;
const first = (name: string) => (name || '').trim().split(/\s+/)[0] ?? '';
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

type Party = { id: string; role: string; name: string; email: string };
type Agent = { realtorId: string; name: string; email: string; deals: AgentDeal[]; automations: AutomationState };

async function agents(key: AutomationKey): Promise<Agent[]> {
  await ensureSchema();
  const rows = await query<{ realtor_id: string; workspace: unknown; automations: unknown; first_name: string | null; last_name: string | null; email: string; notify: string | null }>(
    `SELECT s.realtor_id, w.workspace, s.automations, r.first_name, r.last_name, r.email, w.workspace->'notificationPreferences'->>'notificationEmail' AS notify
     FROM closing_time_settings s JOIN agent_command_center_workspaces w ON w.realtor_id=s.realtor_id JOIN realtors r ON r.id=s.realtor_id
     WHERE COALESCE((s.automations->>$1)::boolean, FALSE)`, [key]);
  const out: Agent[] = [];
  for (const r of rows) {
    const parsed = agentCommandCenterWorkspaceSchema.safeParse(r.workspace);
    if (!parsed.success) continue;
    out.push({
      realtorId: r.realtor_id, automations: merge(r.automations), deals: parsed.data.deals.filter((d) => !d.isTemplate),
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Your agent', email: r.notify || r.email,
    });
  }
  return out;
}

async function partiesFor(realtorId: string, dealId: string, roles: string[]): Promise<Party[]> {
  const rows = await query<Party>(`SELECT id, role, name, email FROM closing_time_parties WHERE realtor_id=$1 AND deal_id=$2 AND role = ANY($3::text[]) AND email <> ''`, [realtorId, dealId, roles]);
  return rows.filter((p) => validEmail(p.email));
}

/** Records the send first so a retry never doubles it; undoes the record when the send fails. */
async function sendOnce(a: Agent, deal: AgentDeal, kind: string, ref: string, to: Party, subject: string, body: string, logLine: string, errors: string[]): Promise<boolean> {
  const claim = await query<{ ref: string }>(`INSERT INTO closing_time_automation_log (realtor_id, deal_id, kind, ref) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING ref`, [a.realtorId, deal.id, kind, ref]);
  if (!claim[0]) return false;
  const sent = await sendEmail({ to: to.email, cc: a.email || undefined, replyTo: a.email || undefined, subject: `${propertyOf(deal)}: ${subject}`, html: html(body) });
  if ((sent as { ok?: boolean })?.ok === false) {
    await query(`DELETE FROM closing_time_automation_log WHERE realtor_id=$1 AND deal_id=$2 AND kind=$3 AND ref=$4`, [a.realtorId, deal.id, kind, ref]);
    errors.push(`${kind} ${deal.id}: ${(sent as { error?: string }).error ?? 'send failed'}`);
    return false;
  }
  await logDealEvent(a.realtorId, deal.id, 'email', `${logLine} (${to.name || to.email})`).catch(() => undefined);
  return true;
}

const signOff = (a: Agent) => `Thank you,\n${a.name}`;
const nextDates = (deal: AgentDeal, today: string, n: number) => dealTimeline(deal).filter((i) => i.date >= today).slice(0, n);

// ---- runners (called from the daily cron) ----

/** 2. Chase missing documents. */
export async function runDocChase(today: string): Promise<{ sent: number; escalated: number; errors: string[] }> {
  const out = { sent: 0, escalated: 0, errors: [] as string[] };
  for (const a of await agents('docChase')) {
    for (const deal of a.deals) {
      if (deal.status === 'completed') continue;
      const reqs = await query<{ id: string; label: string; person_name: string; created_at: Date | string }>(
        `SELECT id, label, person_name, created_at FROM closing_time_doc_requests WHERE realtor_id=$1 AND deal_id=$2 AND status='pending' ORDER BY created_at`, [a.realtorId, deal.id]);
      const people = await partiesFor(a.realtorId, deal.id, ['client', 'lender', 'title', 'coop_agent', 'other']);
      for (const r of reqs) {
        const log = await query<{ n: number; last: Date | string | null }>(`SELECT COUNT(*)::int AS n, MAX(sent_at) AS last FROM closing_time_automation_log WHERE realtor_id=$1 AND deal_id=$2 AND kind='docchase' AND ref LIKE $3`, [a.realtorId, deal.id, `${r.id}:%`]);
        const sentSoFar = log[0]?.n ?? 0;
        const base = new Date(log[0]?.last ?? r.created_at).getTime();
        if (Date.now() - base < 3 * DAY - 3_600_000) continue;
        const person = people.find((p) => p.name.trim().toLowerCase() === r.person_name.trim().toLowerCase());
        if (sentSoFar >= 3) {
          const esc2 = await sendOnce(a, deal, 'docchase-escalate', r.id, { id: '', role: '', name: a.name, email: a.email }, `Still missing: ${r.label}`,
            `${r.person_name || 'The person you asked'} has not uploaded "${r.label}" after 3 automatic reminders. Please follow up yourself.\n\n${signOff({ ...a, name: 'Closing Time' })}`, `Missing document escalation emailed to you: ${r.label}`, out.errors);
          if (esc2) out.escalated += 1;
          continue;
        }
        if (!person) continue;
        const token = await setPortalLink(a.realtorId, deal.id, r.person_name, {});
        const link = `${CLOSING_TIME_ORIGIN}/deal-portal/${token}`;
        const closing = deal.closingDate ? daysBetween(today, deal.closingDate) : null;
        const urgent = closing !== null && closing <= 7;
        const body = `Hello ${first(person.name)},\n\nA friendly reminder that I still need "${r.label}" for ${propertyOf(deal)}.${urgent ? ' Closing is close, so please send it today if you can.' : ''}\n\nYou can upload it here: ${link}\n\n${signOff(a)}`;
        if (await sendOnce(a, deal, 'docchase', `${r.id}:${sentSoFar + 1}`, person, `Reminder: ${r.label}`, body, `Document reminder emailed: ${r.label}`, out.errors)) out.sent += 1;
      }
    }
  }
  return out;
}

/** 3. Weekly client update (Mondays). */
export async function runWeeklyUpdates(today: string): Promise<{ sent: number; errors: string[] }> {
  const out = { sent: 0, errors: [] as string[] };
  if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) return out;
  for (const a of await agents('weeklyUpdate')) {
    for (const deal of a.deals) {
      if (deal.status === 'completed') continue;
      const clients = await partiesFor(a.realtorId, deal.id, ['client']);
      if (!clients.length) continue;
      const next = nextDates(deal, today, 4);
      const docs = await query<{ label: string }>(`SELECT label FROM closing_time_doc_requests WHERE realtor_id=$1 AND deal_id=$2 AND status='pending' ORDER BY created_at`, [a.realtorId, deal.id]);
      for (const c of clients) {
        const body = `Hello ${first(c.name)},\n\nHere is your weekly update for ${propertyOf(deal)}.\n\nComing up:\n${next.length ? next.map((n) => `- ${n.label}: ${n.date}`).join('\n') : '- No upcoming dates yet'}\n\nStill needed from you:\n${docs.length ? docs.map((d) => `- ${d.label}`).join('\n') : '- Nothing right now'}\n\nReply to this email with any questions.\n\n${signOff(a)}`;
        if (await sendOnce(a, deal, 'weekly', `${today}:${c.id}`, c, 'Your Weekly Update', body, 'Weekly update emailed', out.errors)) out.sent += 1;
      }
    }
  }
  return out;
}

const CHECKLIST = ['Confirm the time and place of closing with the title company', 'Do the final walkthrough', 'Set up utilities and the move-in date', 'Confirm funds: wire or cashier check, verified by phone with the title company', 'Bring a government photo ID', 'Confirm who is bringing the keys and garage remotes'];

/** 5, 8 and 9. Closing-day checklist, Zapier closing-soon event, title handoff. */
export async function runClosingCountdown(today: string): Promise<{ checklist: number; handoff: number; events: number; errors: string[] }> {
  const out = { checklist: 0, handoff: 0, events: 0, errors: [] as string[] };
  const all = new Map<string, Agent>();
  for (const k of ['closingDay', 'titleHandoff', 'zapierEvents'] as const) for (const a of await agents(k)) all.set(a.realtorId, a);
  for (const a of all.values()) {
    for (const deal of a.deals) {
      if (deal.status === 'completed' || !deal.closingDate) continue;
      const left = daysBetween(today, deal.closingDate);
      if (a.automations.closingDay && left === 3) {
        const people = await partiesFor(a.realtorId, deal.id, ['client', 'title']);
        for (const p of people) {
          const body = `Hello ${first(p.name)},\n\nClosing for ${propertyOf(deal)} is on ${deal.closingDate}. Here is the checklist for the next three days:\n\n${CHECKLIST.map((c) => `- ${c}`).join('\n')}\n\nCall me with any question before closing.\n\n${signOff(a)}`;
          if (await sendOnce(a, deal, 'closingday', `${deal.closingDate}:${p.id}`, p, 'Closing-Day Checklist', body, 'Closing-day checklist emailed', out.errors)) out.checklist += 1;
        }
      }
      if (a.automations.titleHandoff && left === 7) {
        const titles = await partiesFor(a.realtorId, deal.id, ['title']);
        const contacts = await query<Party>(`SELECT id, role, name, email FROM closing_time_parties WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [a.realtorId, deal.id]);
        for (const t of titles) {
          const dates = dealTimeline(deal).map((n) => `- ${n.label}: ${n.date}`).join('\n') || '- No dates entered';
          const people = contacts.map((c) => `- ${c.role.replace('_', ' ')}: ${c.name}${c.email ? ` <${c.email}>` : ''}`).join('\n');
          const body = `Hello ${first(t.name)},\n\nHere is the handoff summary for ${propertyOf(deal)}. Closing is ${deal.closingDate}.\n\nKey dates:\n${dates}\n\nContacts on the deal:\n${people}\n\nPlease reply to confirm you have what you need. I will send documents separately.\n\n${signOff(a)}`;
          if (await sendOnce(a, deal, 'handoff', `${deal.closingDate}:${t.id}`, t, 'Title Handoff Summary', body, 'Title handoff summary emailed', out.errors)) out.handoff += 1;
        }
      }
      if (a.automations.zapierEvents && left === 3) {
        const claim = await query<{ ref: string }>(`INSERT INTO closing_time_automation_log (realtor_id, deal_id, kind, ref) VALUES ($1,$2,'zapier',$3) ON CONFLICT DO NOTHING RETURNING ref`, [a.realtorId, deal.id, deal.closingDate]);
        if (claim[0]) { await dispatchDealEvents(a.realtorId, [{ event: 'deal.closing_soon', deal }]).catch(() => undefined); out.events += 1; }
      }
    }
  }
  return out;
}

/** 6. Post-close follow-up. */
export async function runPostClose(today: string): Promise<{ sent: number; errors: string[] }> {
  const out = { sent: 0, errors: [] as string[] };
  for (const a of await agents('postClose')) {
    for (const deal of a.deals) {
      if (deal.status !== 'completed' || !deal.closeoutDate) continue;
      if (/terminat|cancel|fell|withdr|expired/i.test(deal.closeoutOutcome || '')) continue;
      const since = daysBetween(deal.closeoutDate, today);
      if (since < 1 || since > 7) continue;
      for (const c of await partiesFor(a.realtorId, deal.id, ['client'])) {
        const body = `Hello ${first(c.name)},\n\nCongratulations on closing on ${propertyOf(deal)}. It was a pleasure working with you.\n\nIf you had a good experience, I would be grateful for a short review, or an introduction to a friend or family member who is buying or selling. Reply to this email and I will gladly help with anything you need after the move.\n\n${signOff(a)}`;
        if (await sendOnce(a, deal, 'postclose', c.id, c, 'Thank You', body, 'Post-close thank-you emailed', out.errors)) out.sent += 1;
      }
    }
  }
  return out;
}

/** 4. Closing date changed: tell everyone on the deal. Called after a workspace save. */
export async function notifyDateMoves(realtorId: string, before: AgentCommandCenterWorkspace | null, after: AgentCommandCenterWorkspace): Promise<void> {
  const state = await getAutomations(realtorId);
  if (!state.deadlineMoves || !before) return;
  const me = await query<{ first_name: string | null; last_name: string | null; email: string; notify: string | null }>(
    `SELECT r.first_name, r.last_name, r.email, (SELECT w.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w WHERE w.realtor_id=r.id) AS notify FROM realtors r WHERE r.id=$1`, [realtorId]);
  const a: Agent = { realtorId, deals: [], automations: state, name: [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' ') || 'Your agent', email: me[0]?.notify || me[0]?.email || '' };
  const prev = new Map(before.deals.map((d) => [d.id, d]));
  const errors: string[] = [];
  for (const deal of after.deals) {
    const p = prev.get(deal.id);
    if (!p || deal.isTemplate || deal.status === 'completed' || !deal.closingDate || !p.closingDate || p.closingDate === deal.closingDate) continue;
    for (const person of await partiesFor(realtorId, deal.id, ['client', 'lender', 'title', 'coop_agent'])) {
      const body = `Hello ${first(person.name)},\n\nThe closing date for ${propertyOf(deal)} has moved from ${p.closingDate} to ${deal.closingDate}. Please update your calendar. Dates tied to closing have been updated.\n\nReply to this email with any question.\n\n${signOff(a)}`;
      await sendOnce(a, deal, 'datemove', `${p.closingDate}>${deal.closingDate}:${person.id}:${randomUUID().slice(0, 4)}`, person, 'Closing Date Changed', body, 'Closing date change emailed', errors);
    }
  }
}
