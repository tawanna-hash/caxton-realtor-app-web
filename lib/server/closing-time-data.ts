import { randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';
import {
  agentCommandCenterWorkspaceSchema,
  agentDealSchema,
  type AgentCommandCenterWorkspace,
  type AgentDeal,
} from '@/lib/agent-command-center-workspace';
import {
  getAgentCommandCenterWorkspace,
  saveAgentCommandCenterWorkspace,
} from '@/lib/server/agent-command-center-workspaces';

const MAX_BACKUPS_PER_AGENT = 12;
const MAX_DEALS = 100;

let schemaPromise: Promise<void> | null = null;

export function ensureClosingTimeBackupSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS closing_time_backups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'monthly',
        deal_count INTEGER NOT NULL DEFAULT 0,
        workspace JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_backups_realtor_idx ON closing_time_backups (realtor_id, created_at DESC)`);
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

export type BackupSummary = { id: string; kind: string; dealCount: number; createdAt: string };

export async function createBackup(realtorId: string, kind: 'monthly' | 'manual' | 'pre-import'): Promise<BackupSummary | null> {
  await ensureClosingTimeBackupSchema();
  const stored = await getAgentCommandCenterWorkspace(realtorId);
  if (!stored) return null;
  const rows = await query<{ id: string; created_at: string | Date }>(
    `INSERT INTO closing_time_backups (realtor_id, kind, deal_count, workspace)
     VALUES ($1, $2, $3, $4::jsonb) RETURNING id, created_at`,
    [realtorId, kind, stored.workspace.deals.length, JSON.stringify(stored.workspace)],
  );
  await query(
    `DELETE FROM closing_time_backups WHERE realtor_id = $1 AND id NOT IN (
       SELECT id FROM closing_time_backups WHERE realtor_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [realtorId, MAX_BACKUPS_PER_AGENT],
  );
  const r = rows[0];
  return { id: r.id, kind, dealCount: stored.workspace.deals.length, createdAt: new Date(r.created_at).toISOString() };
}

export async function listBackups(realtorId: string): Promise<BackupSummary[]> {
  await ensureClosingTimeBackupSchema();
  const rows = await query<{ id: string; kind: string; deal_count: number; created_at: string | Date }>(
    `SELECT id, kind, deal_count, created_at FROM closing_time_backups WHERE realtor_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [realtorId, MAX_BACKUPS_PER_AGENT],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, dealCount: r.deal_count, createdAt: new Date(r.created_at).toISOString() }));
}

export async function getBackupWorkspace(realtorId: string, id: string): Promise<{ workspace: AgentCommandCenterWorkspace; createdAt: string } | null> {
  await ensureClosingTimeBackupSchema();
  const rows = await query<{ workspace: unknown; created_at: string | Date }>(
    `SELECT workspace, created_at FROM closing_time_backups WHERE realtor_id = $1 AND id = $2 LIMIT 1`,
    [realtorId, id],
  );
  if (!rows[0]) return null;
  return { workspace: agentCommandCenterWorkspaceSchema.parse(rows[0].workspace), createdAt: new Date(rows[0].created_at).toISOString() };
}

/** Back up every workspace that has deals and has had no backup in the past 25 days. */
export async function runMonthlyBackups(): Promise<{ backedUp: number; skipped: number }> {
  await ensureClosingTimeBackupSchema();
  const rows = await query<{ realtor_id: string }>(
    `SELECT w.realtor_id
       FROM agent_command_center_workspaces w
      WHERE jsonb_array_length(COALESCE(w.workspace->'deals', '[]'::jsonb)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM closing_time_backups b
           WHERE b.realtor_id = w.realtor_id AND b.kind = 'monthly' AND b.created_at > NOW() - INTERVAL '25 days')`,
  );
  let backedUp = 0;
  for (const row of rows) {
    if (await createBackup(row.realtor_id, 'monthly')) backedUp += 1;
  }
  return { backedUp, skipped: 0 };
}

/* ---------- CSV ---------- */

export function csvEscape(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function dealsToCsv(deals: AgentDeal[]): string {
  const headers = ['Property Address', 'Buyers', 'Sellers', 'Deal Type', 'Side', 'Status', 'Effective Date', 'Closing Date', 'Close-Out Date', 'Lender', 'Client Contacts', 'Notes'];
  return toCsv(headers, deals.filter((d) => !d.isTemplate).map((d) => [
    d.propertyAddress, d.buyerNames, d.sellerNames, d.dealType, d.agentSide, d.status, d.effectiveDate, d.closingDate, d.closeoutDate, d.lender,
    d.clientContacts.map((c) => [c.name, c.email, c.phone].filter(Boolean).join(' ')).join('; '), d.notes,
  ]));
}

export function contactsToCsv(deals: AgentDeal[]): string {
  const headers = ['Name', 'Role', 'Email', 'Phone', 'Property Address'];
  const rows: unknown[][] = [];
  for (const d of deals) {
    if (d.isTemplate) continue;
    for (const c of d.clientContacts) rows.push([c.name, c.role, c.email, c.phone, d.propertyAddress]);
    for (const p of d.serviceProviders) rows.push([p.name, p.category, p.email, p.phone, d.propertyAddress]);
  }
  return toCsv(headers, rows);
}

/* ---------- import ---------- */

const ALIASES: Record<string, string[]> = {
  propertyAddress: ['property address', 'address', 'property', 'loop name', 'transaction name', 'street address'],
  buyerNames: ['buyers', 'buyer', 'buyer names', 'buyer name', 'client'],
  sellerNames: ['sellers', 'seller', 'seller names', 'seller name'],
  effectiveDate: ['effective date', 'contract date', 'executed date', 'contract effective date', 'under contract'],
  closingDate: ['closing date', 'close date', 'closing', 'estimated closing date', 'settlement date'],
  status: ['status', 'stage', 'transaction status'],
  dealType: ['deal type', 'transaction type', 'type'],
  agentSide: ['side', 'representing', 'agent side'],
  lender: ['lender', 'loan officer', 'mortgage company'],
  notes: ['notes', 'note', 'comments'],
  clientEmail: ['client email', 'buyer email', 'email'],
  clientPhone: ['client phone', 'buyer phone', 'phone'],
};

function toIsoDate(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const us = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function mapStatus(value: string): AgentDeal['status'] {
  const v = value.toLowerCase();
  if (/(closed|complete|sold)/.test(v)) return 'completed';
  if (/(closing|clear)/.test(v)) return 'closing';
  if (/(active|pending|contract|option)/.test(v)) return 'active';
  return 'prep';
}

function mapType(value: string): AgentDeal['dealType'] {
  const v = value.toLowerCase();
  if (/lease|rent/.test(v) && /list/.test(v)) return 'listing_lease';
  if (/lease|rent/.test(v)) return 'lease';
  if (/list/.test(v)) return 'listing_sale';
  return 'purchase';
}

export type ImportPreview = {
  total: number;
  valid: number;
  skipped: Array<{ row: number; reason: string }>;
  mapped: Record<string, string>;
  sample: Array<{ propertyAddress: string; buyerNames: string; sellerNames: string; effectiveDate: string; closingDate: string; status: string }>;
};

export function buildDealsFromCsv(text: string): { deals: AgentDeal[]; preview: ImportPreview } {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error('The file needs a header row and at least one deal.');
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  const mapped: Record<string, string> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const idx = headers.findIndex((h) => names.includes(h));
    if (idx >= 0) { col[field] = idx; mapped[field] = table[0][idx].trim(); }
  }
  if (col.propertyAddress === undefined) throw new Error('No address column found. Add a column named Property Address.');
  const get = (row: string[], f: string) => (col[f] === undefined ? '' : (row[col[f]] ?? '').trim());
  const now = new Date().toISOString();
  const deals: AgentDeal[] = [];
  const skipped: ImportPreview['skipped'] = [];
  table.slice(1).forEach((row, i) => {
    const address = get(row, 'propertyAddress');
    if (!address) { skipped.push({ row: i + 2, reason: 'Missing address' }); return; }
    const side = get(row, 'agentSide').toLowerCase();
    const email = get(row, 'clientEmail');
    const phone = get(row, 'clientPhone');
    const buyers = get(row, 'buyerNames');
    const candidate = {
      id: `deal-${randomUUID()}`,
      title: address.slice(0, 200),
      propertyAddress: address.slice(0, 400),
      buyerNames: buyers.slice(0, 300),
      sellerNames: get(row, 'sellerNames').slice(0, 300),
      effectiveDate: toIsoDate(get(row, 'effectiveDate')),
      closingDate: toIsoDate(get(row, 'closingDate')),
      status: mapStatus(get(row, 'status')),
      dealType: mapType(get(row, 'dealType')),
      agentSide: side.startsWith('buy') ? 'buyer' : side.startsWith('list') || side.startsWith('sell') ? 'listing' : '',
      lender: get(row, 'lender').slice(0, 200),
      notes: get(row, 'notes').slice(0, 4000),
      clientContacts: email || phone ? [{ id: `contact-${randomUUID()}`, name: (buyers || 'Client').slice(0, 200), role: 'Client', email: email.slice(0, 200), phone: phone.slice(0, 60) }] : [],
      createdAt: now,
      updatedAt: now,
    };
    const parsed = agentDealSchema.safeParse(candidate);
    if (!parsed.success) { skipped.push({ row: i + 2, reason: 'Could not read this row' }); return; }
    deals.push(parsed.data);
  });
  return {
    deals,
    preview: {
      total: table.length - 1,
      valid: deals.length,
      skipped: skipped.slice(0, 50),
      mapped,
      sample: deals.slice(0, 5).map((d) => ({ propertyAddress: d.propertyAddress, buyerNames: d.buyerNames, sellerNames: d.sellerNames, effectiveDate: d.effectiveDate, closingDate: d.closingDate, status: d.status })),
    },
  };
}

export async function importDeals(realtorId: string, deals: AgentDeal[]): Promise<{ added: number; total: number }> {
  await createBackup(realtorId, 'pre-import');
  const stored = await getAgentCommandCenterWorkspace(realtorId);
  const existing = stored?.workspace.deals ?? [];
  const known = new Set(existing.map((d) => d.propertyAddress.trim().toLowerCase()).filter(Boolean));
  const fresh = deals.filter((d) => !known.has(d.propertyAddress.trim().toLowerCase()));
  if (existing.length + fresh.length > MAX_DEALS) throw new Error(`An account can hold ${MAX_DEALS} deals. Archive or delete some before importing.`);
  if (!fresh.length) return { added: 0, total: existing.length };
  const workspace: AgentCommandCenterWorkspace = {
    ...(stored?.workspace ?? agentCommandCenterWorkspaceSchema.parse({})),
    deals: [...existing, ...fresh],
  };
  const result = await saveAgentCommandCenterWorkspace(realtorId, workspace, stored ? stored.version : null);
  if (!result.saved) throw new Error('Your workspace changed in another window. Refresh and try again.');
  return { added: fresh.length, total: workspace.deals.length };
}
