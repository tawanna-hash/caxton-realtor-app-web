import { randomUUID } from 'crypto';
import { SAML } from '@node-saml/node-saml';
import { agentCommandCenterWorkspaceSchema } from '@/lib/agent-command-center-workspace';
import { dealRisks, dealTimeline } from '@/lib/closing-time-risks';
import { ApiError } from '@/lib/server/error';
import { query } from '@/lib/server/db/neon';
import { ensureAssistSchema } from '@/lib/server/closing-time-assist';
import { CLOSING_TIME_ORIGIN } from '@/lib/closing-time-origin';

export type Brokerage = {
  id: string; name: string; slug: string; emailDomains: string[];
  ssoEntryPoint: string; ssoIdpIssuer: string; ssoCert: string; ssoEnabled: boolean;
};

let schemaPromise: Promise<void> | null = null;
export function ensureBrokerageSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await ensureAssistSchema();
    await query(`CREATE TABLE IF NOT EXISTS closing_time_brokerages (
      id UUID PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, email_domains TEXT[] NOT NULL DEFAULT '{}',
      sso_entry_point TEXT NOT NULL DEFAULT '', sso_idp_issuer TEXT NOT NULL DEFAULT '', sso_cert TEXT NOT NULL DEFAULT '',
      sso_enabled BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_brokerage_members (
      brokerage_id UUID NOT NULL REFERENCES closing_time_brokerages(id) ON DELETE CASCADE,
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent','admin')),
      PRIMARY KEY (brokerage_id, realtor_id))`);
  })().catch((e) => { schemaPromise = null; throw e; });
  return schemaPromise;
}

type Row = { id: string; name: string; slug: string; email_domains: string[]; sso_entry_point: string; sso_idp_issuer: string; sso_cert: string; sso_enabled: boolean };
const toB = (r: Row): Brokerage => ({ id: r.id, name: r.name, slug: r.slug, emailDomains: r.email_domains, ssoEntryPoint: r.sso_entry_point, ssoIdpIssuer: r.sso_idp_issuer, ssoCert: r.sso_cert, ssoEnabled: r.sso_enabled });
const cols = 'id, name, slug, email_domains, sso_entry_point, sso_idp_issuer, sso_cert, sso_enabled';

export async function listBrokerages() {
  await ensureBrokerageSchema();
  const rows = await query<Row>(`SELECT ${cols} FROM closing_time_brokerages ORDER BY name`);
  const out = [];
  for (const b of rows) {
    const members = await query<{ realtor_id: string; role: string; email: string; first_name: string | null; last_name: string | null }>(
      `SELECT m.realtor_id, m.role, r.email, r.first_name, r.last_name FROM closing_time_brokerage_members m JOIN realtors r ON r.id=m.realtor_id WHERE m.brokerage_id=$1 ORDER BY r.email`, [b.id]);
    out.push({ ...toB(b), members: members.map((m) => ({ realtorId: m.realtor_id, role: m.role, email: m.email, name: [m.first_name, m.last_name].filter(Boolean).join(' ') })) });
  }
  return out;
}

export async function saveBrokerage(input: { id?: string; name: string; slug: string; emailDomains: string[]; ssoEntryPoint: string; ssoIdpIssuer: string; ssoCert: string; ssoEnabled: boolean }) {
  await ensureBrokerageSchema();
  const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!slug) throw new ApiError(400, 'Slug is required');
  const domains = input.emailDomains.map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  const id = input.id ?? randomUUID();
  await query(`INSERT INTO closing_time_brokerages (id, name, slug, email_domains, sso_entry_point, sso_idp_issuer, sso_cert, sso_enabled)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug, email_domains=EXCLUDED.email_domains,
      sso_entry_point=EXCLUDED.sso_entry_point, sso_idp_issuer=EXCLUDED.sso_idp_issuer, sso_cert=EXCLUDED.sso_cert, sso_enabled=EXCLUDED.sso_enabled`,
    [id, input.name.trim(), slug, domains, input.ssoEntryPoint.trim(), input.ssoIdpIssuer.trim(), input.ssoCert.trim(), input.ssoEnabled]);
  return id;
}

export async function addMember(brokerageId: string, email: string, role: 'agent' | 'admin') {
  await ensureBrokerageSchema();
  const r = await query<{ id: string }>(`SELECT id FROM realtors WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email.trim()]);
  if (!r[0]) throw new ApiError(404, 'No RealtyLine account with that email. The agent must sign up first.');
  await query(`INSERT INTO closing_time_brokerage_members (brokerage_id, realtor_id, role) VALUES ($1,$2,$3) ON CONFLICT (brokerage_id, realtor_id) DO UPDATE SET role=EXCLUDED.role`, [brokerageId, r[0].id, role]);
}
export async function removeMember(brokerageId: string, realtorId: string) {
  await ensureBrokerageSchema();
  await query(`DELETE FROM closing_time_brokerage_members WHERE brokerage_id=$1 AND realtor_id=$2`, [brokerageId, realtorId]);
}

export async function getAdminBrokerage(realtorId: string): Promise<Brokerage | null> {
  await ensureBrokerageSchema();
  const rows = await query<Row>(`SELECT b.${cols.split(', ').join(', b.')} FROM closing_time_brokerages b JOIN closing_time_brokerage_members m ON m.brokerage_id=b.id WHERE m.realtor_id=$1 AND m.role='admin' LIMIT 1`, [realtorId]);
  return rows[0] ? toB(rows[0]) : null;
}

export type OfficeAgent = {
  realtorId: string; name: string; email: string; activeDeals: number; urgent: number; watch: number;
  draftsWaiting: number; nextDate: string; nextLabel: string;
  deals: { id: string; title: string; closingDate: string; urgent: number; watch: number }[];
};

/** Office-wide view for brokerage admins. Reads each member's deal data; exposes counts and dates, not form contents. */
export async function officeOverview(brokerageId: string, today: string): Promise<OfficeAgent[]> {
  await ensureBrokerageSchema();
  const rows = await query<{ realtor_id: string; email: string; first_name: string | null; last_name: string | null; workspace: unknown | null }>(
    `SELECT m.realtor_id, r.email, r.first_name, r.last_name, w.workspace
     FROM closing_time_brokerage_members m JOIN realtors r ON r.id=m.realtor_id
     LEFT JOIN agent_command_center_workspaces w ON w.realtor_id=m.realtor_id
     WHERE m.brokerage_id=$1 ORDER BY r.last_name, r.first_name`, [brokerageId]);
  const drafts = await query<{ realtor_id: string; n: number }>(
    `SELECT f.realtor_id, COUNT(*)::int AS n FROM closing_time_followups f JOIN closing_time_brokerage_members m ON m.realtor_id=f.realtor_id
     WHERE m.brokerage_id=$1 AND f.status='draft' GROUP BY f.realtor_id`, [brokerageId]);
  const draftMap = new Map(drafts.map((d) => [d.realtor_id, d.n]));
  return rows.map((row) => {
    const parsed = row.workspace ? agentCommandCenterWorkspaceSchema.safeParse(row.workspace) : null;
    const deals = parsed?.success ? parsed.data.deals.filter((d) => d.status !== 'completed') : [];
    let next: { date: string; label: string } | null = null;
    const dealRows = deals.map((d) => {
      const risks = dealRisks(d, today);
      for (const t of dealTimeline(d)) if (t.date >= today && (!next || t.date < next.date)) next = { date: t.date, label: `${t.label} (${d.propertyAddress || d.title})` };
      return { id: d.id, title: d.propertyAddress || d.title, closingDate: d.closingDate, urgent: risks.filter((r) => r.severity === 'high').length, watch: risks.filter((r) => r.severity === 'medium').length };
    });
    return {
      realtorId: row.realtor_id, name: [row.first_name, row.last_name].filter(Boolean).join(' '), email: row.email,
      activeDeals: deals.length, urgent: dealRows.reduce((a, d) => a + d.urgent, 0), watch: dealRows.reduce((a, d) => a + d.watch, 0),
      draftsWaiting: draftMap.get(row.realtor_id) ?? 0, nextDate: (next as { date: string } | null)?.date ?? '', nextLabel: (next as { label: string } | null)?.label ?? '', deals: dealRows,
    };
  });
}

export function officeCsv(agents: OfficeAgent[]): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Agent', 'Email', 'Deal', 'Closing date', 'Urgent risks', 'Watch risks'].map(q).join(',')];
  for (const a of agents) {
    if (!a.deals.length) lines.push([a.name, a.email, '', '', 0, 0].map(q).join(','));
    for (const d of a.deals) lines.push([a.name, a.email, d.title, d.closingDate, d.urgent, d.watch].map(q).join(','));
  }
  return lines.join('\n');
}

/* ---------- SAML single sign-on ---------- */

export async function getBrokerageBySlug(slug: string): Promise<Brokerage | null> {
  await ensureBrokerageSchema();
  const rows = await query<Row>(`SELECT ${cols} FROM closing_time_brokerages WHERE slug=$1 LIMIT 1`, [slug]);
  return rows[0] ? toB(rows[0]) : null;
}

function siteOrigin(): string { return CLOSING_TIME_ORIGIN; }
export const spEntityId = (slug: string) => `${siteOrigin()}/api/sso/saml/${slug}`;
export const spAcsUrl = (slug: string) => `${siteOrigin()}/api/sso/saml/${slug}/acs`;

export function samlFor(b: Brokerage): SAML {
  return new SAML({
    callbackUrl: spAcsUrl(b.slug),
    entryPoint: b.ssoEntryPoint,
    issuer: spEntityId(b.slug),
    idpIssuer: b.ssoIdpIssuer || undefined,
    idpCert: b.ssoCert,
    audience: spEntityId(b.slug),
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    acceptedClockSkewMs: 120_000,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  });
}

/** Maps a verified SAML identity to an existing account whose email domain the brokerage owns, and enrolls them. */
export async function resolveSsoRealtor(b: Brokerage, rawEmail: string): Promise<{ id: string; email: string } | null> {
  const email = rawEmail.trim().toLowerCase();
  const domain = email.split('@')[1] ?? '';
  if (!domain || !b.emailDomains.includes(domain)) return null;
  const r = await query<{ id: string; email: string }>(`SELECT id, email FROM realtors WHERE LOWER(email)=$1 LIMIT 1`, [email]);
  if (!r[0]) return null;
  await query(`INSERT INTO closing_time_brokerage_members (brokerage_id, realtor_id, role) VALUES ($1,$2,'agent') ON CONFLICT DO NOTHING`, [b.id, r[0].id]);
  return r[0];
}
