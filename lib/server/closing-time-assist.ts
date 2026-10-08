import { portalForms } from '@/lib/server/portal-forms';
import { randomBytes, randomUUID } from 'crypto';
import { logDealEvent, listUnauditedEvents } from '@/lib/server/closing-time-events';
import { agentCommandCenterWorkspaceSchema, type AgentDeal } from '@/lib/agent-command-center-workspace';
import { dealRisks, dealTimeline } from '@/lib/closing-time-risks';
import { sendEmail } from '@/lib/email';
import { ApiError } from '@/lib/server/error';
import { query } from '@/lib/server/db/neon';
import { ensureAgentCommandCenterWorkspaceSchema, getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { CLOSING_TIME_ORIGIN } from '@/lib/closing-time-origin';

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
    await query(`CREATE TABLE IF NOT EXISTS closing_time_portal_people (
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL, person_key TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '', token TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, deal_id, person_key))`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_doc_requests (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      label TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', person_key TEXT NOT NULL DEFAULT '', person_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', emailed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), uploaded_at TIMESTAMPTZ, received_at TIMESTAMPTZ)`);
    await query(`ALTER TABLE closing_time_doc_requests ADD COLUMN IF NOT EXISTS log_requested BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS log_uploaded BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS log_received BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_doc_requests_deal_idx ON closing_time_doc_requests (realtor_id, deal_id, created_at DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_checklists (
      realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE, steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_settings (
      realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE, auto_intro BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`ALTER TABLE closing_time_settings ADD COLUMN IF NOT EXISTS auto_signature BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE closing_time_settings ADD COLUMN IF NOT EXISTS automations JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_signatures (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL, to_name TEXT NOT NULL DEFAULT '', to_email TEXT NOT NULL, document TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', reminders_sent INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_reminder_at TIMESTAMPTZ, closed_at TIMESTAMPTZ)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_signatures_open_idx ON closing_time_signatures (realtor_id, status)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_portal_uploads (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL, doc_id TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, data_b64 TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed BOOLEAN NOT NULL DEFAULT FALSE)`);
    await query(`ALTER TABLE closing_time_portal_uploads ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE closing_time_portal_uploads ADD COLUMN IF NOT EXISTS uploader TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE closing_time_portal_uploads ADD COLUMN IF NOT EXISTS stored_in TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE closing_time_portal_uploads ADD COLUMN IF NOT EXISTS stored_path TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE closing_time_portal_uploads ADD COLUMN IF NOT EXISTS stored_url TEXT NOT NULL DEFAULT ''`);
    await query(`UPDATE closing_time_portal_uploads o SET archived=TRUE WHERE o.archived=FALSE AND o.doc_id<>'signed' AND EXISTS (SELECT 1 FROM closing_time_portal_uploads n WHERE n.realtor_id=o.realtor_id AND n.deal_id=o.deal_id AND n.doc_id=o.doc_id AND n.created_at>o.created_at)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_portal_uploads_deal_idx ON closing_time_portal_uploads (realtor_id, deal_id, created_at DESC)`);
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
  if (!deal) throw new ApiError(404, 'Deal not found. Save the transaction first.');
  return deal;
}

type PartyRow = { id: string; deal_id: string; role: string; name: string; email: string };
type FollowRow = { id: string; deal_id: string; kind: string; to_name: string; to_email: string; subject: string; body: string; status: string; created_at: Date | string; sent_at: Date | string | null };
const iso = (v: Date | string) => (typeof v === 'string' ? v : v.toISOString());

export async function listAssist(realtorId: string, dealId: string) {
  await ensureAssistSchema();
  const [parties, follows, portal, checklist, uploads, settings, sigs] = await Promise.all([
    query<PartyRow>(`SELECT id, deal_id, role, name, email FROM closing_time_parties WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [realtorId, dealId]),
    query<FollowRow>(`SELECT id, deal_id, kind, to_name, to_email, subject, body, status, created_at, sent_at FROM closing_time_followups WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at DESC LIMIT 50`, [realtorId, dealId]),
    query<{ token: string }>(`SELECT token FROM closing_time_portals WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]),
    query<{ steps: ChecklistStep[] }>(`SELECT steps FROM closing_time_checklists WHERE realtor_id=$1`, [realtorId]),
    query<{ id: string; doc_id: string; filename: string; size_bytes: number; created_at: Date | string; reviewed: boolean; archived: boolean; uploader: string; stored_in: string; stored_path: string; stored_url: string }>(
      `SELECT id, doc_id, filename, size_bytes, created_at, reviewed, archived, uploader, stored_in, stored_path, stored_url FROM closing_time_portal_uploads WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at DESC LIMIT 50`, [realtorId, dealId]),
    query<{ auto_intro: boolean; auto_signature: boolean }>(`SELECT auto_intro, auto_signature FROM closing_time_settings WHERE realtor_id=$1`, [realtorId]),
    query<{ id: string; to_name: string; to_email: string; document: string; status: string; reminders_sent: number; created_at: Date | string }>(
      `SELECT id, to_name, to_email, document, status, reminders_sent, created_at FROM closing_time_signatures WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at DESC LIMIT 30`, [realtorId, dealId]),
  ]);
  return {
    parties: parties.map((p): Party => ({ id: p.id, dealId: p.deal_id, role: p.role as PartyRole, name: p.name, email: p.email })),
    followUps: follows.map((f): FollowUp => ({
      id: f.id, dealId: f.deal_id, kind: f.kind as FollowUpKind, toName: f.to_name, toEmail: f.to_email, subject: f.subject, body: f.body,
      status: f.status as FollowUp['status'], createdAt: iso(f.created_at), sentAt: f.sent_at ? iso(f.sent_at) : null,
    })),
    portalToken: portal[0]?.token ?? null,
    portalLinks: await listPortalLinks(realtorId, dealId),
    docRequests: await listDocRequests(realtorId, dealId),
    auditEvents: await listUnauditedEvents(realtorId, dealId),
    checklist: checklist[0]?.steps?.length ? checklist[0].steps : DEFAULT_CHECKLIST,
    customChecklist: Boolean(checklist[0]?.steps?.length),
    uploads: uploads.map((u) => ({ id: u.id, docId: u.doc_id, filename: u.filename, sizeBytes: u.size_bytes, createdAt: iso(u.created_at), reviewed: u.reviewed, archived: u.archived, uploader: u.uploader, storedIn: u.stored_in, storedPath: u.stored_path, storedUrl: u.stored_url })),
    autoIntro: settings[0]?.auto_intro ?? false,
    autoSignature: settings[0]?.auto_signature ?? false,
    signatures: sigs.map((x) => ({ id: x.id, toName: x.to_name, toEmail: x.to_email, document: x.document, status: x.status, remindersSent: x.reminders_sent, createdAt: iso(x.created_at) })),
  };
}

export async function addParty(realtorId: string, dealId: string, p: { role: PartyRole; name: string; email: string }) {
  await ensureAssistSchema();
  await query(`INSERT INTO closing_time_parties (id, realtor_id, deal_id, role, name, email) VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), realtorId, dealId, p.role, p.name.trim().slice(0, 200), p.email.trim().toLowerCase().slice(0, 320)]);
  await logDealEvent(realtorId, dealId, 'person', `Person added: ${p.name.trim() || p.email.trim()} (${p.role})`);
}
export async function removeParty(realtorId: string, partyId: string) {
  await ensureAssistSchema();
  const gone = await query<{ deal_id: string; name: string; email: string; role: string }>(`DELETE FROM closing_time_parties WHERE id=$1 AND realtor_id=$2 RETURNING deal_id, name, email, role`, [partyId, realtorId]);
  if (gone[0]) await logDealEvent(realtorId, gone[0].deal_id, 'person', `Person removed: ${gone[0].name || gone[0].email} (${gone[0].role})`);
}

export async function saveChecklist(realtorId: string, steps: ChecklistStep[]) {
  await ensureAssistSchema();
  await query(`INSERT INTO closing_time_checklists (realtor_id, steps) VALUES ($1,$2::jsonb)
    ON CONFLICT (realtor_id) DO UPDATE SET steps=EXCLUDED.steps, updated_at=NOW()`, [realtorId, JSON.stringify(steps)]);
}

export type PortalLink = { key: string; name: string; token: string };
export const personKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);

/** Finds the deal behind a portal token: a per-person link first, then a legacy shared deal link. */
async function resolvePortalToken(token: string): Promise<{ realtor_id: string; deal_id: string; person: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  await ensureAssistSchema();
  const person = await query<{ realtor_id: string; deal_id: string; name: string }>(`SELECT realtor_id, deal_id, name FROM closing_time_portal_people WHERE token=$1 LIMIT 1`, [token]);
  if (person[0]) return { realtor_id: person[0].realtor_id, deal_id: person[0].deal_id, person: person[0].name };
  const shared = await query<{ realtor_id: string; deal_id: string }>(`SELECT realtor_id, deal_id FROM closing_time_portals WHERE token=$1 LIMIT 1`, [token]);
  return shared[0] ? { ...shared[0], person: '' } : null;
}

export async function listPortalLinks(realtorId: string, dealId: string): Promise<PortalLink[]> {
  await ensureAssistSchema();
  const rows = await query<{ person_key: string; name: string; token: string }>(`SELECT person_key, name, token FROM closing_time_portal_people WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [realtorId, dealId]);
  return rows.map((r) => ({ key: r.person_key, name: r.name, token: r.token }));
}

/** Creates, resets, or turns off one person's private link. Creating the first one retires the old shared deal link. */
export async function setPortalLink(realtorId: string, dealId: string, name: string, opts: { reset?: boolean; disable?: boolean }): Promise<string | null> {
  await ensureAssistSchema();
  const key = personKey(name);
  if (!key) throw new Error('Add the person\'s name first.');
  if (opts.disable) { await query(`DELETE FROM closing_time_portal_people WHERE realtor_id=$1 AND deal_id=$2 AND person_key=$3`, [realtorId, dealId, key]); return null; }
  if (!opts.reset) {
    const existing = await query<{ token: string }>(`SELECT token FROM closing_time_portal_people WHERE realtor_id=$1 AND deal_id=$2 AND person_key=$3`, [realtorId, dealId, key]);
    if (existing[0]) return existing[0].token;
  }
  const token = randomBytes(32).toString('base64url');
  await query(`INSERT INTO closing_time_portal_people (realtor_id, deal_id, person_key, name, token) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (realtor_id, deal_id, person_key) DO UPDATE SET token=EXCLUDED.token, name=EXCLUDED.name, created_at=NOW()`, [realtorId, dealId, key, name.trim().slice(0, 200), token]);
  await query(`DELETE FROM closing_time_portals WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
  return token;
}

export type DocRequest = { id: string; label: string; note: string; personName: string; status: 'pending' | 'uploaded' | 'received' | 'cancelled'; emailed: boolean; createdAt: string; uploadedAt: string | null; receivedAt: string | null; logged: { requested: boolean; uploaded: boolean; received: boolean } };
type DocRequestRow = { id: string; label: string; note: string; person_name: string; status: string; emailed: boolean; created_at: Date | string; uploaded_at: Date | string | null; received_at: Date | string | null; log_requested: boolean; log_uploaded: boolean; log_received: boolean };
const toDocRequest = (r: DocRequestRow): DocRequest => ({ id: r.id, label: r.label, note: r.note, personName: r.person_name, status: r.status as DocRequest['status'], emailed: r.emailed, createdAt: new Date(r.created_at).toISOString(), uploadedAt: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : null, receivedAt: r.received_at ? new Date(r.received_at).toISOString() : null, logged: { requested: r.log_requested, uploaded: r.log_uploaded, received: r.log_received } });

export async function listDocRequests(realtorId: string, dealId: string): Promise<DocRequest[]> {
  await ensureAssistSchema();
  const rows = await query<DocRequestRow>(`SELECT id, label, note, person_name, status, emailed, created_at, uploaded_at, received_at, log_requested, log_uploaded, log_received FROM closing_time_doc_requests WHERE realtor_id=$1 AND deal_id=$2 AND status<>'cancelled' ORDER BY created_at DESC LIMIT 100`, [realtorId, dealId]);
  return rows.map(toDocRequest);
}

/** Records that the agent asked a client for a document. It stays pending until the client uploads it. */
export async function createDocRequest(realtorId: string, dealId: string, input: { label: string; note: string; personName: string }): Promise<string> {
  await ensureAssistSchema();
  const id = randomUUID();
  await query(`INSERT INTO closing_time_doc_requests (id, realtor_id, deal_id, label, note, person_key, person_name) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, realtorId, dealId, input.label.slice(0, 200), input.note.slice(0, 500), personKey(input.personName), input.personName.slice(0, 200)]);
  return id;
}
export async function markDocRequestEmailed(realtorId: string, id: string) {
  await query(`UPDATE closing_time_doc_requests SET emailed=TRUE WHERE id=$1 AND realtor_id=$2`, [id, realtorId]);
}
export async function markDocRequestLogged(realtorId: string, id: string, event: 'requested' | 'uploaded' | 'received'): Promise<void> {
  const col = event === 'requested' ? 'log_requested' : event === 'uploaded' ? 'log_uploaded' : 'log_received';
  await query(`UPDATE closing_time_doc_requests SET ${col}=TRUE WHERE id=$1 AND realtor_id=$2`, [id, realtorId]);
}
export async function setDocRequestStatus(realtorId: string, id: string, status: 'received' | 'cancelled'): Promise<void> {
  await ensureAssistSchema();
  if (status === 'received') await query(`UPDATE closing_time_doc_requests SET status='received', received_at=NOW() WHERE id=$1 AND realtor_id=$2 AND status='uploaded'`, [id, realtorId]);
  else await query(`UPDATE closing_time_doc_requests SET status='cancelled' WHERE id=$1 AND realtor_id=$2 AND status IN ('pending','uploaded')`, [id, realtorId]);
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
  clientFirstName: string; clientNames: string; clientSide: 'buyer' | 'seller'; daysToClosing: number | null; titleCompany: string;
  steps: { label: string; date: string; note: string; state: 'done' | 'current' | 'upcoming' }[];
  timeline: { id: string; label: string; date: string; done: boolean; note: string }[];
  forms: { family: string; label: string }[];
  requests: { id: string; label: string; note: string; status: 'pending' | 'uploaded' | 'received' }[];
  documents: { id: string; label: string; status: string }[];
  todos: { title: string; dueDate: string }[];
};

/** Resolves a portal token to its agent and deal (null for an unknown or malformed token). */
export async function getPortalDeal(token: string): Promise<{ realtorId: string; deal: AgentDeal } | null> {
  const row = await resolvePortalToken(token);
  if (!row) return null;
  const deal = await loadDeal(row.realtor_id, row.deal_id);
  return deal ? { realtorId: row.realtor_id, deal } : null;
}

/** Read-only client view. Only client-safe fields are exposed: no notes, form data, or activity. */
export async function getPortalView(token: string): Promise<PortalView | null> {
  const link = await resolvePortalToken(token);
  if (!link) return null;
  const agentRows = await query<{ first_name: string | null; last_name: string | null; email: string }>(
    `SELECT r.first_name, r.last_name, COALESCE(NULLIF((SELECT w2.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w2 WHERE w2.realtor_id=r.id),''), r.email) AS email FROM realtors r WHERE r.id=$1 LIMIT 1`, [link.realtor_id]);
  const row = { realtor_id: link.realtor_id, deal_id: link.deal_id, first_name: agentRows[0]?.first_name ?? null, last_name: agentRows[0]?.last_name ?? null, email: agentRows[0]?.email ?? '' };
  const deal = await loadDeal(row.realtor_id, row.deal_id);
  if (!deal) return null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const label: Record<AgentDeal['status'], string> = { prep: 'Getting started', active: 'Under contract', closing: 'Heading to closing', completed: 'Closed' };
  const clientSide: 'buyer' | 'seller' = deal.agentSide === 'listing' ? 'seller' : 'buyer';
  const names = (clientSide === 'seller' ? deal.sellerNames : deal.buyerNames) || '';
  const clientFirstName = ((link.person || names.split(/\s*(?:&|,|\band\b|\/)\s*/i)[0] || '').trim().split(/\s+/)[0]) ?? '';
  const titleCompany = (deal.contractDetails?.titleCompany || deal.formFields?.p02_f038 || '').trim();
  const days = (to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const explain = (id: string): string => {
    if (id === 'earnest-money-delivery') return `Earnest money goes to ${titleCompany || 'the title company'}. Call them on a number you trust before sending any funds.`;
    if (id === 'option-fee-delivery') return 'The option fee is delivered under the contract terms. Your agent will confirm where it goes.';
    if (id === 'option-period-ends') return 'Your option period ends on this date. Finish inspections before it.';
    if (id === 'closing-date') return clientSide === 'seller' ? 'Closing day: you sign and the sale funds.' : 'Closing day: you sign, the loan funds, and you get the keys.';
    return '';
  };
  const timeline = dealTimeline(deal).map((i) => ({ id: i.id, label: i.label, date: i.date, done: i.date < today || Boolean(deal.documentChecks?.[`dl:${i.id}`]), note: explain(i.id) }));
  const dateOf = (id: string) => timeline.find((i) => i.id === id)?.date ?? '';
  const eff = deal.effectiveDate, em = dateOf('earnest-money-delivery'), opt = dateOf('option-period-ends'), close = deal.closingDate;
  const noteOf = (id: string) => timeline.find((i) => i.id === id)?.note ?? '';
  const raw = [
    { label: 'Under Contract', date: eff, note: 'Your contract is in effect.', done: Boolean(eff) && today >= eff },
    { label: 'Earnest Money', date: em, note: noteOf('earnest-money-delivery'), done: Boolean(em) && today > em },
    { label: 'Option Period', date: opt, note: noteOf('option-period-ends'), done: Boolean(opt) && today > opt },
    { label: 'Closing Prep', date: '', note: 'Final preparations before closing day.', done: Boolean(close) && today >= close },
    { label: 'Closing', date: close, note: noteOf('closing-date'), done: Boolean(close) && today > close },
  ];
  const cur = raw.findIndex((x) => !x.done);
  const steps = raw.map((x, i) => ({ label: x.label, date: x.date, note: x.note, state: (x.done ? 'done' : i === cur ? 'current' : 'upcoming') as 'done' | 'current' | 'upcoming' }));
  return {
    property: (deal.propertyAddress || '').trim() || `${deal.title || 'Deal'} (address not entered)`,
    stage: label[deal.status],
    closingDate: deal.closingDate,
    agentName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    agentEmail: row.email,
    clientFirstName, clientNames: names, clientSide, titleCompany,
    daysToClosing: deal.closingDate && deal.closingDate >= today ? days(deal.closingDate) : null,
    steps, timeline,
    requests: (await listDocRequests(row.realtor_id, row.deal_id)).filter((r) => r.status !== 'cancelled' && (!r.personName || personKey(r.personName) === personKey(link.person))).map((r) => ({ id: r.id, label: r.label, note: r.note, status: r.status as 'pending' | 'uploaded' | 'received' })),
    forms: portalForms(deal).map((v) => ({ family: v.formFamily, label: v.title })),
    documents: deal.documents.filter((d) => d.status !== 'not_needed').map((d) => ({ id: d.id, label: d.label, status: d.status })),
    todos: deal.tasks.filter((t) => !t.complete).slice(0, 20).map((t) => ({ title: t.title, dueDate: t.dueDate })),
  };
}

function esc(v: string) { return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)); }
const htmlBody = (text: string) => `<div style="font-family:Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:640px">${esc(text).replace(/\n/g, '<br>')}</div>`;

async function agentIdentity(realtorId: string) {
  const r = await query<{ first_name: string | null; last_name: string | null; email: string }>(`SELECT first_name, last_name, COALESCE(NULLIF((SELECT w2.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w2 WHERE w2.realtor_id=realtors.id),''), realtors.email) AS email FROM realtors WHERE id=$1`, [realtorId]);
  const row = r[0];
  return { name: [row?.first_name, row?.last_name].filter(Boolean).join(' ') || 'Your agent', email: row?.email ?? '' };
}

export async function draftFollowUp(realtorId: string, dealId: string, input: { kind: FollowUpKind; partyId?: string; detail?: string }) {
  await ensureAssistSchema();
  const deal = await requireDeal(realtorId, dealId);
  const agent = await agentIdentity(realtorId);
  const property = (deal.propertyAddress || '').trim() || `${deal.title || 'Deal'} (address not entered)`;
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
  const own = await import('./closing-time-connected').then((m) => m.sendFromAgentMailbox(realtorId, { to: f.to_email, subject: f.subject, text: f.body })).catch(() => null);
  if (own?.ok) { await logDealEvent(realtorId, f.deal_id, 'email', `Email sent from your own mailbox to ${f.to_email}: ${f.subject}`); return { ok: true }; }
  const sent = await sendEmail({ to: f.to_email, cc: agent.email || undefined, replyTo: agent.email || undefined, subject: f.subject, html: htmlBody(f.body) });
  if (!sent.ok) {
    await query(`UPDATE closing_time_followups SET status='draft', sent_at=NULL WHERE id=$1`, [id]);
    return { ok: false, error: sent.error ?? 'Send failed' };
  }
  await logDealEvent(realtorId, f.deal_id, 'email', `Email sent to ${f.to_email}: ${f.subject}`);
  return { ok: true };
}

/** Daily end-of-day style summary. One per agent per Central date. Opt-in via the existing email alert setting. */
export async function runDailySummaries(today: string): Promise<{ sent: number; errors: string[] }> {
  await ensureAssistSchema();
  const out = { sent: 0, errors: [] as string[] };
  const rows = await query<{ realtor_id: string; email: string | null; first_name: string | null; workspace: unknown }>(
    `SELECT w.realtor_id, w.workspace, COALESCE(NULLIF(w.workspace->'notificationPreferences'->>'notificationEmail',''), r.email) AS email, r.first_name FROM agent_command_center_workspaces w JOIN realtors r ON r.id=w.realtor_id LEFT JOIN closing_time_settings cs ON cs.realtor_id=w.realtor_id WHERE COALESCE(cs.automations->>'dailyDigest','true') <> 'false'`);
  const site = CLOSING_TIME_ORIGIN;
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
      if (lines.length) sections.push(`<h3 style="margin:18px 0 6px;color:#301D5D">${esc((deal.propertyAddress || '').trim() || `${deal.title || 'Deal'} (address not entered)`)}</h3><ul style="margin:0;padding-left:18px">${lines.join('')}</ul>`);
    }
    if (!sections.length) continue;
    const claim = await query<{ realtor_id: string }>(`INSERT INTO closing_time_daily_summaries (realtor_id, summary_date) VALUES ($1,$2::date) ON CONFLICT DO NOTHING RETURNING realtor_id`, [row.realtor_id, today]);
    if (!claim[0]) continue;
    const html = `<div style="font-family:Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:640px;margin:auto"><p style="margin:0 0 8px;color:#7059A8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Closing Time daily summary</p>${sections.join('')}<p style="margin-top:24px"><a href="${site}/agents/closing-time" style="display:inline-block;background:#301D5D;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open Closing Time</a></p></div>`;
    const sent = await sendEmail({ to: row.email, subject: 'Closing Time: your deals today', html });
    if (sent.ok) out.sent += 1;
    else {
      await query(`DELETE FROM closing_time_daily_summaries WHERE realtor_id=$1 AND summary_date=$2::date`, [row.realtor_id, today]);
      out.errors.push(`summary ${row.realtor_id}: ${sent.error ?? 'send failed'}`);
    }
  }
  return out;
}


export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const UPLOAD_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']);

/** Client upload through the portal link. Only attaches to a document the agent already requested. */
export async function savePortalUpload(token: string, docId: string, file: { name: string; type: string; bytes: Buffer }): Promise<{ ok: boolean; error?: string; id?: string; realtorId?: string; dealId?: string; uploader?: string; label?: string }> {
  if (!UPLOAD_TYPES.has(file.type)) return { ok: false, error: 'Upload a PDF or a photo (JPG, PNG, HEIC, WebP).' };
  if (file.bytes.length === 0 || file.bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'File must be under 4 MB.' };
  const row = await resolvePortalToken(token);
  if (!row) return { ok: false, error: 'Invalid link' };
  const deal = await loadDeal(row.realtor_id, row.deal_id);
  let request: DocRequest | undefined;
  if (docId.startsWith('req:')) {
    request = (await listDocRequests(row.realtor_id, row.deal_id)).find((r) => r.id === docId.slice(4) && r.status !== 'cancelled' && (!r.personName || personKey(r.personName) === personKey(row.person)));
    if (!request) return { ok: false, error: 'That request is no longer open.' };
  }
  const doc = request ? { label: request.label } : docId === 'other' ? { label: 'General Upload' } : deal?.documents.find((d) => d.id === docId && d.status !== 'not_needed');
  if (!doc) return { ok: false, error: 'That document is not requested.' };
  const count = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM closing_time_portal_uploads WHERE realtor_id=$1 AND deal_id=$2 AND created_at > NOW() - INTERVAL '1 day'`, [row.realtor_id, row.deal_id]);
  if ((count[0]?.n ?? 0) >= 25) return { ok: false, error: 'Upload limit reached for today. Contact your agent.' };
  if (docId !== 'other' && !request) await query(`UPDATE closing_time_portal_uploads SET archived=TRUE WHERE realtor_id=$1 AND deal_id=$2 AND doc_id=$3 AND archived=FALSE`, [row.realtor_id, row.deal_id, docId]);
  const id = randomUUID();
  if (!request) await logDealEvent(row.realtor_id, row.deal_id, 'upload', `${row.person || 'Client'} uploaded ${file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)} (${doc.label})`);
  await query(`INSERT INTO closing_time_portal_uploads (id, realtor_id, deal_id, doc_id, filename, content_type, size_bytes, data_b64, uploader) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, row.realtor_id, row.deal_id, docId, file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'upload', file.type, file.bytes.length, file.bytes.toString('base64'), row.person]);
  if (request && request.status === 'pending') await query(`UPDATE closing_time_doc_requests SET status='uploaded', uploaded_at=NOW() WHERE id=$1 AND status='pending'`, [request.id]);
  return { ok: true, id, realtorId: row.realtor_id, dealId: row.deal_id, uploader: row.person, label: doc.label };
}

/** Emails the agent about a client upload, saying who sent it and where the file was filed. */
export async function notifyAgentOfUpload(realtorId: string, dealId: string, info: { uploader: string; label: string; filename: string; storedNote: string }) {
  const deal = await loadDeal(realtorId, dealId);
  const agent = await query<{ email: string }>(`SELECT COALESCE(NULLIF((SELECT w2.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w2 WHERE w2.realtor_id=realtors.id),''), realtors.email) AS email FROM realtors WHERE id=$1`, [realtorId]);
  if (!agent[0]?.email) return;
  const property = deal?.propertyAddress || deal?.title || 'your deal';
  const who = info.uploader || 'Your client';
  const alert = await sendEmail({ to: agent[0].email, subject: `New upload from ${who}: ${info.label} - ${property}`,
    html: htmlBody(`${who} uploaded "${info.filename}" (${info.label}) for ${property}.\n\n${info.storedNote}`) }).catch(() => ({ ok: false }));
  if (alert.ok) await logDealEvent(realtorId, dealId, 'notification', `Notification email sent to you: new upload from ${who} (${info.filename}). ${info.storedNote}`);
}

/** Marks an upload as filed in the agent's storage and removes the copy held in the database. */
export async function markUploadStored(realtorId: string, uploadId: string, storedIn: string, storedPath: string, storedUrl: string) {
  await ensureAssistSchema();
  await query(`UPDATE closing_time_portal_uploads SET stored_in=$3, stored_path=$4, stored_url=$5, data_b64='' WHERE id=$1 AND realtor_id=$2`, [uploadId, realtorId, storedIn, storedPath.slice(0, 500), storedUrl.slice(0, 1000)]);
}

export async function getUpload(realtorId: string, id: string) {
  await ensureAssistSchema();
  const r = await query<{ filename: string; content_type: string; data_b64: string; uploader: string }>(`SELECT filename, content_type, data_b64, uploader FROM closing_time_portal_uploads WHERE id=$1 AND realtor_id=$2`, [id, realtorId]);
  return r[0] && r[0].data_b64 ? { uploader: r[0].uploader, filename: r[0].filename, contentType: r[0].content_type, bytes: Buffer.from(r[0].data_b64, 'base64') } : null;
}
export async function markUploadReviewed(realtorId: string, id: string) {
  await ensureAssistSchema();
  await query(`UPDATE closing_time_portal_uploads SET reviewed=TRUE WHERE id=$1 AND realtor_id=$2`, [id, realtorId]);
}

export async function setAutoSignature(realtorId: string, on: boolean) {
  await ensureAssistSchema();
  await query(`INSERT INTO closing_time_settings (realtor_id, auto_signature) VALUES ($1,$2) ON CONFLICT (realtor_id) DO UPDATE SET auto_signature=EXCLUDED.auto_signature, updated_at=NOW()`, [realtorId, on]);
}

export async function addSignatureRequest(realtorId: string, dealId: string, partyId: string, document: string) {
  await ensureAssistSchema();
  await requireDeal(realtorId, dealId);
  const p = (await query<PartyRow>(`SELECT id, deal_id, role, name, email FROM closing_time_parties WHERE id=$1 AND realtor_id=$2 AND deal_id=$3`, [partyId, realtorId, dealId]))[0];
  if (!p?.email) throw new ApiError(400, 'Add an email to that contact first.');
  await query(`INSERT INTO closing_time_signatures (id, realtor_id, deal_id, to_name, to_email, document) VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), realtorId, dealId, p.name, p.email, document.trim().slice(0, 200)]);
}

export async function closeSignature(realtorId: string, id: string) {
  await ensureAssistSchema();
  await query(`UPDATE closing_time_signatures SET status='signed', closed_at=NOW() WHERE id=$1 AND realtor_id=$2 AND status IN ('open','escalated')`, [id, realtorId]);
}

/**
 * Automatic signature chasing for agents who turned it on. Reminders go to the
 * person who owes the signature (agent copied): gentle at 2 days, gentle at
 * 4 days, firmer at 6 days or when closing is within 3 days. After the third
 * reminder the agent is told to follow up personally and chasing stops.
 * Messages only mention the document by name, never price or terms.
 */
export async function runSignatureReminders(now = new Date()): Promise<{ sent: number; escalated: number; errors: string[] }> {
  await ensureAssistSchema();
  const out = { sent: 0, escalated: 0, errors: [] as string[] };
  const rows = await query<{ id: string; realtor_id: string; deal_id: string; to_name: string; to_email: string; document: string; reminders_sent: number; created_at: Date | string; last_reminder_at: Date | string | null }>(
    `SELECT g.id, g.realtor_id, g.deal_id, g.to_name, g.to_email, g.document, g.reminders_sent, g.created_at, g.last_reminder_at
     FROM closing_time_signatures g JOIN closing_time_settings s ON s.realtor_id=g.realtor_id AND s.auto_signature
     WHERE g.status='open'`);
  const DAY = 86_400_000;
  for (const g of rows) {
    const base = new Date(g.last_reminder_at ?? g.created_at).getTime();
    if (now.getTime() - base < 2 * DAY - 3_600_000) continue;
    const deal = await loadDeal(g.realtor_id, g.deal_id);
    const agent = await agentIdentity(g.realtor_id);
    if (!deal || deal.status === 'completed') { await query(`UPDATE closing_time_signatures SET status='cancelled', closed_at=NOW() WHERE id=$1`, [g.id]); continue; }
    const property = (deal.propertyAddress || '').trim() || `${deal.title || 'Deal'} (address not entered)`;
    if (g.reminders_sent >= 3) {
      await query(`UPDATE closing_time_signatures SET status='escalated' WHERE id=$1 AND status='open'`, [g.id]);
      const esc = await sendEmail({ to: agent.email, subject: `Signature still missing: ${g.document} - ${property}`, html: htmlBody(`${g.to_name || g.to_email} has not signed "${g.document}" after 3 automatic reminders. Please follow up personally.`) });
      if (esc.ok) await logDealEvent(g.realtor_id, g.deal_id, 'notification', `Notification email sent to you: ${g.to_name || g.to_email} still has not signed ${g.document}`);
      out.escalated += 1;
      continue;
    }
    const today = now.toISOString().slice(0, 10);
    const closingSoon = deal.closingDate && (Date.parse(`${deal.closingDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY <= 3;
    const firm = g.reminders_sent >= 2 || closingSoon;
    const first = g.to_name ? g.to_name.split(/\s+/)[0] : '';
    const body = firm
      ? `Hello${first ? ` ${first}` : ''},\n\nWe still need your signature on ${g.document} for ${property}. Because we are close to an important date, please sign today so we stay on schedule. Call or reply to me right away if you have a question or need help.\n\nThank you,\n${agent.name}`
      : `Hello${first ? ` ${first}` : ''},\n\nA friendly reminder that ${g.document} for ${property} still needs your signature. Please sign when you get a chance, and let me know if anything is unclear.\n\nThank you,\n${agent.name}`;
    const subject = `${firm ? 'Action needed: ' : 'Reminder: '}signature on ${g.document} - ${property}`;
    const claim = await query<{ id: string }>(`UPDATE closing_time_signatures SET reminders_sent=reminders_sent+1, last_reminder_at=NOW() WHERE id=$1 AND status='open' AND reminders_sent=$2 RETURNING id`, [g.id, g.reminders_sent]);
    if (!claim[0]) continue;
    const sent = await sendEmail({ to: g.to_email, cc: agent.email || undefined, replyTo: agent.email || undefined, subject, html: htmlBody(body) });
    if (sent.ok) {
      out.sent += 1;
      await logDealEvent(g.realtor_id, g.deal_id, 'email', `Signature reminder emailed to ${g.to_email}: ${g.document}`);
      await query(`INSERT INTO closing_time_followups (id, realtor_id, deal_id, kind, to_name, to_email, subject, body, status, sent_at) VALUES ($1,$2,$3,'signature',$4,$5,$6,$7,'sent',NOW())`,
        [randomUUID(), g.realtor_id, g.deal_id, g.to_name, g.to_email, subject, body]);
    } else {
      await query(`UPDATE closing_time_signatures SET reminders_sent=reminders_sent-1, last_reminder_at=$2 WHERE id=$1`, [g.id, g.last_reminder_at]);
      out.errors.push(`${g.id}: ${sent.error ?? 'send failed'}`);
    }
  }
  return out;
}

export async function setAutoIntro(realtorId: string, on: boolean) {
  await ensureAssistSchema();
  await query(`INSERT INTO closing_time_settings (realtor_id, auto_intro) VALUES ($1,$2) ON CONFLICT (realtor_id) DO UPDATE SET auto_intro=EXCLUDED.auto_intro, updated_at=NOW()`, [realtorId, on]);
}

/**
 * Opt-in only. Sends the standard introduction (no price or terms) once to each
 * lender, title, and co-op agent contact on active deals. The agent is copied.
 */
export async function runAutoIntros(): Promise<{ sent: number; errors: string[] }> {
  await ensureAssistSchema();
  const out = { sent: 0, errors: [] as string[] };
  const agents = await query<{ realtor_id: string; workspace: unknown }>(
    `SELECT s.realtor_id, w.workspace FROM closing_time_settings s JOIN agent_command_center_workspaces w ON w.realtor_id=s.realtor_id WHERE s.auto_intro`);
  for (const a of agents) {
    const parsed = agentCommandCenterWorkspaceSchema.safeParse(a.workspace);
    if (!parsed.success) continue;
    for (const deal of parsed.data.deals) {
      if (deal.status === 'completed' || !deal.effectiveDate) continue;
      const parties = await query<PartyRow>(`SELECT id, deal_id, role, name, email FROM closing_time_parties WHERE realtor_id=$1 AND deal_id=$2 AND role IN ('lender','title','coop_agent') AND email <> ''`, [a.realtor_id, deal.id]);
      for (const party of parties) {
        const done = await query<{ id: string }>(`SELECT id FROM closing_time_followups WHERE realtor_id=$1 AND deal_id=$2 AND kind='intro' AND LOWER(to_email)=LOWER($3) AND status IN ('sent','dismissed') LIMIT 1`, [a.realtor_id, deal.id, party.email]);
        if (done[0]) continue;
        await query(`DELETE FROM closing_time_followups WHERE realtor_id=$1 AND deal_id=$2 AND kind='intro' AND LOWER(to_email)=LOWER($3) AND status='draft'`, [a.realtor_id, deal.id, party.email]);
        await draftFollowUp(a.realtor_id, deal.id, { kind: 'intro', partyId: party.id });
        const draft = await query<{ id: string }>(`SELECT id FROM closing_time_followups WHERE realtor_id=$1 AND deal_id=$2 AND kind='intro' AND LOWER(to_email)=LOWER($3) AND status='draft' ORDER BY created_at DESC LIMIT 1`, [a.realtor_id, deal.id, party.email]);
        if (!draft[0]) continue;
        const r = await approveFollowUp(a.realtor_id, draft[0].id);
        if (r.ok) out.sent += 1; else out.errors.push(`${deal.id}/${party.email}: ${r.error}`);
      }
    }
  }
  return out;
}

export async function auditCsv(realtorId: string, dealId: string): Promise<string> {
  const deal = await requireDeal(realtorId, dealId);
  const data = await listAssist(realtorId, dealId);
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows: string[][] = [['When', 'Type', 'Detail']];
  deal.activity.forEach((a) => rows.push([a.createdAt, 'activity', a.message]));
  data.followUps.forEach((f) => rows.push([f.sentAt ?? f.createdAt, `follow-up (${f.status})`, `${f.toEmail}: ${f.subject}`]));
  data.uploads.forEach((u) => rows.push([u.createdAt, 'client upload', `${u.filename} (${u.archived ? 'archived' : u.reviewed ? 'reviewed' : 'new'})`]));
  rows.sort((x, y) => (x[0] === 'When' ? -1 : y[0] === 'When' ? 1 : x[0].localeCompare(y[0])));
  return rows.map((r) => r.map(q).join(',')).join('\n');
}
