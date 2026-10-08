import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { query } from '@/lib/server/db/neon';
import type { AgentCommandCenterWorkspace, AgentDeal } from '@/lib/agent-command-center-workspace';

export const WEBHOOK_EVENTS = ['deal.created', 'deal.status_changed', 'deal.closing_date_changed', 'deal.closing_soon', 'deal.deleted'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

let schemaPromise: Promise<void> | null = null;
export function ensureAutomationSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS closing_time_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )`);
    await query(`
      CREATE TABLE IF NOT EXISTS closing_time_webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT[] NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_delivery_at TIMESTAMPTZ,
        last_status TEXT
      )`);
    await query(`ALTER TABLE closing_time_webhooks ADD COLUMN IF NOT EXISTS flat BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_webhooks_realtor_idx ON closing_time_webhooks (realtor_id)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_api_keys_realtor_idx ON closing_time_api_keys (realtor_id)`);
  })().catch((e) => { schemaPromise = null; throw e; });
  return schemaPromise;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/* ---------- API keys ---------- */

export type ApiKeySummary = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

export async function createApiKey(realtorId: string, name: string): Promise<{ key: string; summary: ApiKeySummary }> {
  await ensureAutomationSchema();
  const count = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM closing_time_api_keys WHERE realtor_id = $1 AND revoked_at IS NULL`, [realtorId]);
  if ((count[0]?.n ?? 0) >= 5) throw new Error('Up to 5 active keys. Revoke one first.');
  const key = `ct_live_${randomBytes(24).toString('hex')}`;
  const rows = await query<{ id: string; created_at: string | Date }>(
    `INSERT INTO closing_time_api_keys (realtor_id, name, prefix, key_hash) VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
    [realtorId, name, key.slice(0, 15), sha(key)],
  );
  return { key, summary: { id: rows[0].id, name, prefix: key.slice(0, 15), createdAt: new Date(rows[0].created_at).toISOString(), lastUsedAt: null } };
}

export async function listApiKeys(realtorId: string): Promise<ApiKeySummary[]> {
  await ensureAutomationSchema();
  const rows = await query<{ id: string; name: string; prefix: string; created_at: string | Date; last_used_at: string | Date | null }>(
    `SELECT id, name, prefix, created_at, last_used_at FROM closing_time_api_keys WHERE realtor_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [realtorId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: new Date(r.created_at).toISOString(), lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null }));
}

export async function revokeApiKey(realtorId: string, id: string): Promise<void> {
  await ensureAutomationSchema();
  await query(`UPDATE closing_time_api_keys SET revoked_at = NOW() WHERE id = $1 AND realtor_id = $2`, [id, realtorId]);
}

export async function realtorIdForApiKey(authHeader: string | null): Promise<string | null> {
  const m = (authHeader ?? '').match(/^Bearer\s+(ct_live_[a-f0-9]{48})$/);
  if (!m) return null;
  await ensureAutomationSchema();
  const rows = await query<{ id: string; realtor_id: string }>(
    `UPDATE closing_time_api_keys SET last_used_at = NOW() WHERE key_hash = $1 AND revoked_at IS NULL RETURNING id, realtor_id`,
    [sha(m[1])],
  );
  return rows[0]?.realtor_id ?? null;
}

/* ---------- webhooks ---------- */

export type WebhookSummary = { id: string; url: string; events: string[]; active: boolean; lastDeliveryAt: string | null; lastStatus: string | null };

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

/** Resolves the host and rejects it if any address is private, loopback or link-local. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const addrs = await lookup(hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('That address could not be found');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('That address points to a private network and is not allowed');
}

export function validateWebhookUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('Enter a full web address that starts with https://'); }
  if (u.protocol !== 'https:') throw new Error('The address must start with https://');
  const h = u.hostname.toLowerCase();
  if (u.username || u.password) throw new Error('Remove the username and password from the address');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) throw new Error('That address is not allowed');
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(h)) throw new Error('Use a web address, not an IP address');
  return u.toString();
}

export async function createWebhook(realtorId: string, url: string, events: string[], flat = false): Promise<{ secret: string; summary: WebhookSummary }> {
  await ensureAutomationSchema();
  const count = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM closing_time_webhooks WHERE realtor_id = $1`, [realtorId]);
  if ((count[0]?.n ?? 0) >= 25) throw new Error('Up to 25 webhooks. Delete one first.');
  const clean = validateWebhookUrl(url);
  await assertPublicHost(new URL(clean).hostname);
  const secret = `whsec_${randomBytes(24).toString('hex')}`;
  const rows = await query<{ id: string }>(
    `INSERT INTO closing_time_webhooks (realtor_id, url, secret, events, flat) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [realtorId, clean, secret, events, flat],
  );
  return { secret, summary: { id: rows[0].id, url: clean, events, active: true, lastDeliveryAt: null, lastStatus: null } };
}

export async function listWebhooks(realtorId: string): Promise<WebhookSummary[]> {
  await ensureAutomationSchema();
  const rows = await query<{ id: string; url: string; events: string[]; active: boolean; last_delivery_at: string | Date | null; last_status: string | null }>(
    `SELECT id, url, events, active, last_delivery_at, last_status FROM closing_time_webhooks WHERE realtor_id = $1 ORDER BY created_at DESC`,
    [realtorId],
  );
  return rows.map((r) => ({ id: r.id, url: r.url, events: r.events, active: r.active, lastDeliveryAt: r.last_delivery_at ? new Date(r.last_delivery_at).toISOString() : null, lastStatus: r.last_status }));
}

export async function deleteWebhookById(realtorId: string, id: string): Promise<boolean> {
  await ensureAutomationSchema();
  const rows = await query<{ id: string }>(`DELETE FROM closing_time_webhooks WHERE id = $1 AND realtor_id = $2 RETURNING id`, [id, realtorId]);
  return rows.length > 0;
}

export async function deleteWebhook(realtorId: string, id: string): Promise<void> {
  await ensureAutomationSchema();
  await query(`DELETE FROM closing_time_webhooks WHERE id = $1 AND realtor_id = $2`, [id, realtorId]);
}

export async function hasActiveWebhooks(realtorId: string): Promise<boolean> {
  await ensureAutomationSchema();
  const rows = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM closing_time_webhooks WHERE realtor_id = $1 AND active`, [realtorId]);
  return (rows[0]?.n ?? 0) > 0;
}

/** Public, trimmed view of a deal. No documents or private notes leave the account through the API. */
export function publicDeal(d: AgentDeal) {
  return {
    id: d.id,
    property_address: d.propertyAddress,
    buyers: d.buyerNames,
    sellers: d.sellerNames,
    deal_type: d.dealType,
    side: d.agentSide,
    status: d.status,
    workflow_status: d.workflowStatus,
    effective_date: d.effectiveDate || null,
    closing_date: d.closingDate || null,
    lender: d.lender || null,
    contacts: d.clientContacts.map((c) => ({ name: c.name, role: c.role, email: c.email, phone: c.phone })),
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

export function diffDeals(before: AgentCommandCenterWorkspace | null, after: AgentCommandCenterWorkspace): Array<{ event: WebhookEvent; deal: AgentDeal }> {
  const out: Array<{ event: WebhookEvent; deal: AgentDeal }> = [];
  const prev = new Map((before?.deals ?? []).map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (const d of after.deals) {
    if (d.isTemplate) continue;
    seen.add(d.id);
    const p = prev.get(d.id);
    if (!p) { if (d.propertyAddress) out.push({ event: 'deal.created', deal: d }); continue; }
    if (p.status !== d.status || p.workflowStatus !== d.workflowStatus) out.push({ event: 'deal.status_changed', deal: d });
    if (p.closingDate !== d.closingDate) out.push({ event: 'deal.closing_date_changed', deal: d });
  }
  for (const p of before?.deals ?? []) if (!seen.has(p.id) && !p.isTemplate) out.push({ event: 'deal.deleted', deal: p });
  return out;
}

async function deliver(hook: { id: string; url: string; secret: string; flat: boolean }, event: WebhookEvent, deal: AgentDeal): Promise<void> {
  // flat hooks (REST hook subscriptions from automation tools) receive the deal object itself, matching the deals list.
  const body = hook.flat ? JSON.stringify(publicDeal(deal)) : JSON.stringify({ id: randomUUID(), event, created_at: new Date().toISOString(), data: publicDeal(deal) });
  const ts = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', hook.secret).update(`${ts}.${body}`).digest('hex');
  let status = 'error';
  try {
    await assertPublicHost(new URL(hook.url).hostname);
    const res = await fetch(hook.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'ClosingTime-Webhooks/1', 'X-ClosingTime-Event': event, 'X-ClosingTime-Timestamp': String(ts), 'X-ClosingTime-Signature': `sha256=${signature}` },
      body,
    });
    status = String(res.status);
  } catch (e) { status = e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'error'; }
  await query(`UPDATE closing_time_webhooks SET last_delivery_at = NOW(), last_status = $2 WHERE id = $1`, [hook.id, status]).catch(() => undefined);
}

export async function dispatchDealEvents(realtorId: string, events: Array<{ event: WebhookEvent; deal: AgentDeal }>): Promise<void> {
  if (!events.length) return;
  await ensureAutomationSchema();
  const hooks = await query<{ id: string; url: string; secret: string; events: string[]; flat: boolean }>(
    `SELECT id, url, secret, events, flat FROM closing_time_webhooks WHERE realtor_id = $1 AND active`, [realtorId]);
  await Promise.all(hooks.flatMap((h) => events.filter((e) => h.events.includes(e.event)).map((e) => deliver(h, e.event, e.deal))));
}
