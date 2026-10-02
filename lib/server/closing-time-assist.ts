import { randomBytes, randomUUID } from 'crypto';
import { agentCommandCenterWorkspaceSchema, type AgentDeal } from '@/lib/agent-command-center-workspace';
import { dealRisks, dealTimeline } from '@/lib/closing-time-risks';
import { sendEmail } from '@/lib/email';
import { query } from '@/lib/server/db/neon';
import { ensureAgentCommandCenterWorkspaceSchema, getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';

/**
 * Closing Time coordinator tools: deal parties, approval-gated follow-up
 * drafts, per-deal client portal links, checklist templates, and the daily
 * agent summary. Nothing here sends to a third party without the agent
 * pressing approve on the specific draft.
 */

export const PARTY_ROLES = ['client', 'lender', 'title', 'coop_agent', 'other'] as const;
export type PartyRole = typeof PARTY_ROLES[number];
export const FOLLOWUP_KINDS = ['signature', 'lender', 'title', 'intro', 'extension', 'custom'] as const;
export type FollowUpKind = typeof FOLLOWUP_KINDS[number];

export type Party = { id: string; dealId: string; role: PartyRole; name: string; email: string };
export type FollowUp = {
  id: string; dealId: string; kind: FollowUpKind; toName: string; toEmail: string;
  subject: string; body: string; status: 'draft' | 'sent' | 'dismissed'; createdAt: string; sentAt: string | null;
};
export type ChecklistStep = { title: string; offsetDays: number; anchor: 'effective' | 'closing' };

let schemaPromise: Promise<void> | null = null;
export function ensureAssistSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await ensureAgentCommandCenterWorkspaceSchema();
    await query(`CREATE TABLE IF NOT EXISTS closing_time_parties (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_parties_deal_idx ON closing_time_parties (realtor_id, deal_id)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_followups (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL, kind TEXT NOT NULL, to_name TEXT NOT NULL DEFAULT '', to_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_followups_deal_idx ON closing_time_followups (realtor_id, deal_id, created_at DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_portals (
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, deal_id))`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_checklists (
      realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE, steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_daily_summaries (
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, summary_date DATE NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, summary_date))`);
  })().catch((e) => { schemaPromise = null; throw e; });
  return schemaPromise;
}

export const DEFAULT_CHECKLIST: ChecklistStep[] = [
  { title: 'Send introduction email to lender, title company, and co-op agent', offsetDays: 1, anchor: 'effective' },
  { title: 'Confirm earnest money and option fee delivered', offsetDays: 3, anchor: 'effective' },
  { title: 'Schedule inspection', offsetDays: 2, anchor: 'effective' },
  { title: 'Confirm appraisal is ordered and scheduled', offsetDays: 7, anchor: 'effective' },
  { title: 'Confirm title commitment received and reviewed', offsetDays: 10, anchor: 'effective' },
  { title: 'Schedule final walkthrough', offsetDays: -2, anchor: 'closing' },
  { title: 'Confirm closing time and wire instructions by phone with title', offsetDays: -2, anchor: 'closing' },
];

async function loadDeal(realtorId: string, dealId: string): Promise<AgentDeal | null> {
  const record = await getAgentCommandCenterWorkspace(realtorId);
  return record?.workspace.deals.find((d) => d.id === dealId) ?? null;
}

export async function requireDeal(realtorId: string, dealId: string): Promise<AgentDeal> {
  const deal = await loadDeal(realtorId, dealId);
  if (!deal) throw Object.assign(new Error('Deal not found. Save the transaction first.'), { status: 404 });
  return deal;
}

type PartyRow = { id: string; deal_id: string; role: string; name: string; email: string };
type FollowRow = { id: string; deal_id: string; kind: string; to_name: string; to_email: string; subject: string; body: string; status: string; created_at: Date | string; sent_at: Date | string | null };
const iso = (v: Date | string) => (typeof v === 'string' ? v : v.toISOString());

export async function listAssist(realtorId: string, dealId: string) {
  await ensureAssistSchema();
  const [parties, follows, portal, checklist] = await Promise.all([
    query<PartyRow>(`SELECT id, deal_id, role, name, email FROM closing_time_parties WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [realtorId, dealId]),
    query<FollowRow>(`SELECT id, deal_id, kind, to_name, to_email, subject, body, status, created_at, sent_at FROM closing_time_followups WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at DESC LIMIT 50`, [realtorId, dealId]),
    query<{ token: string }>(`SELECT token FROM closing_time_portals WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]),
    query<{ steps: ChecklistStep[] }>(`SELECT steps FROM closing_time_checklists WHERE realtor_id=$1`, [realtorId]),
  ]);
  return {
    parties: parties.map((p): Party => ({ id: p.id, dealId: p.deal_id, role: p.role as PartyRole, name: p.name, email: p.email })),
    followUps: follows.map((f): FollowUp => ({
      id: f.id, dealId: f.deal_id, kind: f.kind as FollowUpKind, toName: f.to_name, toEmail: f.to_email, subject: f.subject, body: f.body,
      status: f.status as FollowUp['status'], createdAt: iso(f.created_at), sentAt: f.sent_at ? iso(f.sent_at) : null,
    })),
    portalToken: portal[0]?.token ?? null,
    checklist: checklist[0]?.steps?.length ? checklist[0].steps : DEFAULT_CHECKLIST,
    customChecklist: Boolean(checklist[0]?.steps?.length),
  };
}

export async function addParty(realtorId: string, dealId: string, p: { role: PartyRole; name: string; email: string }) {
  await ensureAssistSchema();
  await query(`INSERT INTO closing_time_parties (id, realtor_id, deal_id, role, name, email) VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), realtorId, dealId, p.role, p.name.trim().slice(0, 200), p.email.trim().toLowerCase().slice(0, 320)]);
}
export async function removeParty(realtorId: string, partyId: string) {
  await ensureAssistSchema();
  await query(`DELETE FROM closing_time_parties WHERE id=$1 AND realtor_id=$2`, [partyId, realtorId]);
}

export async function saveChecklist(realtorId: string, steps: ChecklistStep[]) {
  await ensureAssistSchema();
  await query(`INSERT INTO closing_time_checklists (realtor_id, steps) VALUES ($1,$2::jsonb)
    ON CONFLICT (realtor_id) DO UPDATE SET steps=EXCLUDED.steps, updated_at=NOW()`, [realtorId, JSON.stringify(steps)]);
}

export async function getOrCreatePortalToken(realtorId: string, dealId: string, reset = false): Promise<string> {
  await ensureAssistSchema();
  if (!reset) {
    const existing = await query<{ token: string }>(`SELECT token FROM closing_time_portals WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
    if (existing[0]) return existing[0].token;
  }
  const token = randomBytes(32).toString('base64url');
  await query(`INSERT INTO closing_time_portals (realtor_id, deal_id, token) VALUES ($1,$2,$3)
    ON CONFLICT (realtor_id, deal_id) DO UPDATE SET token=EXCLUDED.token, created_at=NOW()`, [realtorId, dealId, token]);
  return token;
}
export async function removePortal(realtorId: string, dealId: string) {
  await ensureAssistSchema();
  await query(`DELETE FROM closing_time_portals WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
}

export type PortalView = {
  property: string; stage: string; closingDate: string; agentName: string; agentEmail: string;
  timeline: { label: string; date: string; done: boolean }[];
  documents: { label: string; status: string }[];
  todos: { title: string; dueDate: string }[];
};

/** Read-only client view. Only client-safe fields are exposed: no notes, form data, or activity. */
export async function getPortalView(token: string): Promise<PortalView | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  await ensureAssistSchema();
  const rows = await query<{ realtor_id: string; deal_id: string; first_name: string | null; last_name: string | null; email: string }>(
    `SELECT p.realtor_id, p.deal_id, r.first_name, r.last_name, r.email FROM closing_time_portals p JOIN realtors r ON r.id=p.realtor_id WHERE p.token=$1 LIMIT 1`, [token]);
  const row = rows[0];
  if (!row) return null;
  const deal = await loadDeal(row.realtor_id, row.deal_id);
  if (!deal) return null;
  const today = new Date().toISOString().slice(0, 10);
  const label: Record<AgentDeal['status'], string> = { prep: 'Getting started', active: 'Under contract', closing: 'Heading to closing', completed: 'Closed' };
  return {
    property: deal.propertyAddress || deal.title,
    stage: label[deal.status],
    closingDate: deal.closingDate,
    agentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    agentEmail: row.email,
    timeline: dealTimeline(deal).map((i) => ({ label: i.label, date: i.date, done: i.date < today })),
    documents: deal.documents.filter((d) => d.status !== 'not_needed').map((d) => ({ label: d.label, status: d.status })),
    todos: deal.tasks.filter((t) => !t.complete).slice(0, 20).map((t) => ({ title: t.title, dueDate: t.dueDate })),
  };
}

function esc(v: string) { return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)); }
const htmlBody = (text: string) => `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.55;max-width:640px">${esc(text).replace(/\n/g, '<br>')}</div>`;

async function agentIdentity(realtorId: string) {
  const r = await query<{ first_name: string | null; last_name: string | null; email: string }>(`SELECT first_name, last_name, email FROM realtors WHERE id=$1`, [realtorId]);
  const row = r[0];
  return { name: [row?.first_name, row?.last_name].filter(Boolean).join(' ') || 'Your agent', email: row?.email ?? '' };
}

export async function draftFollowUp(realtorId: string, dealId: string, input: { kind: FollowUpKind; partyId?: string; detail?: string }) {
  await ensureAssistSchema();
  const deal = await requireDeal(realtorId, dealId);
  const agent = await agentIdentity(realtorId);
  const property = deal.propertyAddress || deal.title || 'the transaction';
  const parties = await query<PartyRow>(`SELECT id, deal_id, role, name, email FROM closing_time_parties WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
  const sign = `\n\nThank you,\n${agent.name}`;
  const make = (party: PartyRow | undefined, kind: FollowUpKind) => {
    const hello = `Hello${party?.name ? ` ${party.name.split(/\s+/)[0]}` : ''},\n\n`;
    switch (kind) {
      case 'signature': return { subject: `Signature needed: ${input.detail || 'document'} - ${property}`, body: `${hello}A quick reminder that ${input.detail || 'a document'} for ${property} still needs your signature. Please sign when you can, and let me know if anything is unclear.${sign}` };
      case 'lender': return { subject: `Loan status update - ${property}`, body: `${hello}Could you send me a status update on the loan for ${property}? Specifically the appraisal date and where underwriting stands, plus anything outstanding from the buyers.${sign}` };
      case 'title': return { subject: `Title status update - ${property}`, body: `${hello}Could you confirm the status of the title commitment and survey for ${property}, and let me know if earnest money and the option fee were received?${sign}` };
      case 'intro': return { subject: `Introduction - ${property}`, body: `${hello}I am the agent on ${property}${deal.closingDate ? ` with a scheduled closing of ${deal.closingDate}` : ''}. Please reply with the best contact for questions and send key dates as they come up. I will keep everyone updated.${sign}` };
      default: return { subject: `Update - ${property}`, body: `${hello}${input.detail || ''}${sign}` };
    }
  };
  const targets = input.kind === 'intro' ? parties.filter((p) => ['lender', 'title', 'coop_agent'].includes(p.role) && p.email)
    : [parties.find((p) => p.id === input.partyId)].filter(Boolean) as PartyRow[];
  const list = targets.length ? targets : [undefined];
  for (const party of list) {
    const m = make(party, input.kind);
    await query(`INSERT INTO closing_time_followups (id, realtor_id, deal_id, kind, to_name, to_email, subject, body) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), realtorId, dealId, input.kind, party?.name ?? '', party?.email ?? '', m.subject, m.body]);
  }
  return list.length;
}

export async function saveExtensionDraft(realtorId: string, dealId: string, subject: string, body: string, partyId?: string) {
  await ensureAssistSchema();
  await requireDeal(realtorId, dealId);
  const p = partyId ? (await query<PartyRow>(`SELECT id, deal_id, role, name, email FROM closing_time_parties WHERE id=$1 AND realtor_id=$2`, [partyId, realtorId]))[0] : undefined;
  await query(`INSERT INTO closing_time_followups (id, realtor_id, deal_id, kind, to_name, to_email, subject, body) VALUES ($1,$2,$3,'extension',$4,$5,$6,$7)`,
    [randomUUID(), realtorId, dealId, p?.name ?? '', p?.email ?? '', subject, body]);
}

export async function editFollowUp(realtorId: string, id: string, patch: { toEmail?: string; subject?: string; body?: string }) {
  await ensureAssistSchema();
  await query(`UPDATE closing_time_followups SET to_email=COALESCE($3,to_email), subject=COALESCE($4,subject), body=COALESCE($5,body)
    WHERE id=$1 AND realtor_id=$2 AND status='draft'`, [id, realtorId, patch.toEmail?.trim().toLowerCase() ?? null, patch.subject ?? null, patch.body ?? null]);
}

export async function dismissFollowUp(realtorId: string, id: string) {
  await ensureAssistSchema();
  await query(`UPDATE closing_time_followups SET status='dismissed' WHERE id=$1 AND realtor_id=$2 AND status='draft'`, [id, realtorId]);
}

/** Sends one approved draft. Replies go to the agent, who is copied. */
export async function approveFollowUp(realtorId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  await ensureAssistSchema();
  const claimed = await query<FollowRow>(`UPDATE closing_time_followups SET status='sent', sent_at=NOW()
    WHERE id=$1 AND realtor_id=$2 AND status='draft' RETURNING id, deal_id, kind, to_name, to_email, subject, body, status, created_at, sent_at`, [id, realtorId]);
  const f = claimed[0];
  if (!f) return { ok: false, error: 'Draft not found or already handled' };
  const agent = await agentIdentity(realtorId);
  if (!f.to_email) {
    await query(`UPDATE closing_time_followups SET status='draft', sent_at=NULL WHERE id=$1`, [id]);
    return { ok: false, error: 'Add a recipient email first' };
  }
  const sent = await sendEmail({ to: f.to_email, cc: agent.email || undefined, replyTo: agent.email || undefined, subject: f.subject, html: htmlBody(f.body) });
  if (!sent.ok) {
    await query(`UPDATE closing_time_followups SET status='draft', sent_at=NULL WHERE id=$1`, [id]);
    return { ok: false, error: sent.error ?? 'Send failed' };
  }
  return { ok: true };
}

/** Daily end-of-day style summary. One per agent per Central date. Opt-in via the existing email alert setting. */
export async function runDailySummaries(today: string): Promise<{ sent: number; errors: string[] }> {
  await ensureAssistSchema();
  const out = { sent: 0, errors: [] as string[] };
  const rows = await query<{ realtor_id: string; email: string | null; first_name: string | null; workspace: unknown }>(
    `SELECT w.realtor_id, w.workspace, r.email, r.first_name FROM agent_command_center_workspaces w JOIN realtors r ON r.id=w.realtor_id`);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
  for (const row of rows) {
    const parsed = agentCommandCenterWorkspaceSchema.safeParse(row.workspace);
    if (!parsed.success || !parsed.data.notificationPreferences.emailEnabled || !row.email) continue;
    const deals = parsed.data.deals.filter((d) => d.status !== 'completed');
    if (!deals.length) continue;
    const sections: string[] = [];
    for (const deal of deals) {
      const risks = dealRisks(deal, today);
      const upcoming = dealTimeline(deal).filter((i) => i.date >= today).slice(0, 2);
      const drafts = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM closing_time_followups WHERE realtor_id=$1 AND deal_id=$2 AND status='draft'`, [row.realtor_id, deal.id]);
      const lines = [
        ...risks.map((r) => `<li><strong>${esc(r.title)}.</strong> ${esc(r.detail)}</li>`),
        ...upcoming.map((u) => `<li>${esc(u.label)}: ${esc(u.date)}</li>`),
        ...(drafts[0]?.n ? [`<li>${drafts[0].n} follow-up draft${drafts[0].n === 1 ? '' : 's'} waiting for your approval</li>`] : []),
      ];
      if (lines.length) sections.push(`<h3 style="margin:18px 0 6px;color:#301D5D">${esc(deal.propertyAddress || deal.title)}</h3><ul style="margin:0;padding-left:18px">${lines.join('')}</ul>`);
    }
    if (!sections.length) continue;
    const claim = await query<{ realtor_id: string }>(`INSERT INTO closing_time_daily_summaries (realtor_id, summary_date) VALUES ($1,$2::date) ON CONFLICT DO NOTHING RETURNING realtor_id`, [row.realtor_id, today]);
    if (!claim[0]) continue;
    const html = `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.55;max-width:640px;margin:auto"><p style="margin:0 0 8px;color:#7059A8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Closing Time daily summary</p>${sections.join('')}<p style="margin-top:24px"><a href="${site}/agents/closing-time" style="display:inline-block;background:#301D5D;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open Closing Time</a></p></div>`;
    const sent = await sendEmail({ to: row.email, subject: 'Closing Time: your deals today', html });
    if (sent.ok) out.sent += 1;
    else {
      await query(`DELETE FROM closing_time_daily_summaries WHERE realtor_id=$1 AND summary_date=$2::date`, [row.realtor_id, today]);
      out.errors.push(`summary ${row.realtor_id}: ${sent.error ?? 'send failed'}`);
    }
  }
  return out;
}
