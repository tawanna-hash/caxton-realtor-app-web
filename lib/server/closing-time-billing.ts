/* eslint-disable @typescript-eslint/no-unused-vars */
import { query } from '@/lib/server/db/neon';
import { DEAL_PRICE_CENTS, EXTENSION_PRICE_CENTS, FREE_DEAL_LIMIT } from '@/lib/closing-time-lifecycle';
import { logDealEvent } from '@/lib/server/closing-time-events';

/**
 * Per-account deal ledger. The first two deals an account ever opens are free; every deal after that costs $12
 * and is recorded here when it is opened. Deleting a deal never gives a free slot back, because the ledger is kept
 * apart from the workspace. Accounts that already had deals when the ledger started are counted from those deals.
 */
const EXEMPT_EMAILS = new Set(['tawanna@verock.com', 'tawanna@myrealtyline.com']);
export const isBillingExempt = (email: string | null | undefined): boolean => EXEMPT_EMAILS.has((email ?? '').trim().toLowerCase());

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS closing_time_deal_ledger (
      realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, kind TEXT NOT NULL, payment_intent_id TEXT UNIQUE,
      amount_cents INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, deal_id))`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_extension_ledger (
      payment_intent_id TEXT PRIMARY KEY, realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/** Counts deals created before the ledger existed (the Template deal never counts). */
async function seed(realtorId: string): Promise<void> {
  const any = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM closing_time_deal_ledger WHERE realtor_id=$1`, [realtorId]);
  if (Number(any[0]?.n ?? 0) > 0) return;
  const rows = await query<{ id: string }>(
    `SELECT d->>'id' AS id FROM agent_command_center_workspaces w, jsonb_array_elements(w.workspace->'deals') d
     WHERE w.realtor_id=$1 AND COALESCE((d->>'isTemplate')::boolean, false) = false`, [realtorId]);
  for (const r of rows) {
    await query(`INSERT INTO closing_time_deal_ledger (realtor_id, deal_id, kind) VALUES ($1,$2,'existing') ON CONFLICT DO NOTHING`, [realtorId, r.id]);
  }
}

export async function billingState(realtorId: string, email: string) {
  await ensure();
  await seed(realtorId);
  const rows = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM closing_time_deal_ledger WHERE realtor_id=$1`, [realtorId]);
  const used = Number(rows[0]?.n ?? 0);
  const exempt = isBillingExempt(email);
  return { used, freeLimit: FREE_DEAL_LIMIT, freeLeft: Math.max(0, FREE_DEAL_LIMIT - used), priceCents: DEAL_PRICE_CENTS, exempt, paymentRequired: !exempt && used >= FREE_DEAL_LIMIT };
}

/** Called when an agent starts a new deal. Returns ok, or says a payment is needed first. */
export async function reserveDeal(realtorId: string, email: string, dealId: string): Promise<{ ok: true } | { ok: false; paymentRequired: true }> {
  const state = await billingState(realtorId, email);
  const existing = await query(`SELECT 1 FROM closing_time_deal_ledger WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
  if (existing.length > 0) return { ok: true };
  if (state.paymentRequired) return { ok: false, paymentRequired: true };
  await query(`INSERT INTO closing_time_deal_ledger (realtor_id, deal_id, kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [realtorId, dealId, state.exempt ? 'exempt' : 'free']);
  return { ok: true };
}

export async function createDealPayment(_realtorId: string, _email: string, _dealId: string): Promise<never> {
  throw new Error('Payments are not set up yet.');
}

/** Online payments are removed, so no deal payment can be confirmed. */
export async function confirmDealPayment(_realtorId: string, _dealId: string, _paymentIntentId: string): Promise<boolean> {
  return false;
}

/** The first extension on a deal is free. Each one after that costs $5. Owner accounts are exempt. */
export function extensionNeedsPayment(email: string, extensionsSoFar: number): boolean {
  return !isBillingExempt(email) && extensionsSoFar >= 1;
}

export async function createExtensionPayment(_realtorId: string, _email: string, _dealId: string, _extensionsSoFar: number): Promise<never> {
  throw new Error('Payments are not set up yet.');
}

export async function confirmExtensionPayment(_realtorId: string, _dealId: string, _paymentIntentId: string): Promise<boolean> {
  return false;
}
