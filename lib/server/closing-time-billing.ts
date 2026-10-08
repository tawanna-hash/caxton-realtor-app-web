import { query } from '@/lib/server/db/neon';
import { getStripe, isStripeConfigured, getPublishableKey } from '@/lib/stripe';
import { DEAL_PRICE_CENTS, EXTENSION_PRICE_CENTS, FREE_DEAL_LIMIT } from '@/lib/closing-time-lifecycle';
import { logDealEvent } from '@/lib/server/closing-time-events';

/**
 * Per-account deal ledger. The first two deals an account ever opens are free; every deal after that costs $12
 * and is recorded here when it is opened. Deleting a deal never gives a free slot back, because the ledger is kept
 * apart from the workspace. Accounts that already had deals when the ledger started are counted from those deals.
 */
const EXEMPT_EMAILS = new Set(['tawanna@verock.com', 'tawanna@myrealtyline.com', 'tawanna@itsalmostclosingtime.com']);
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

export async function createDealPayment(realtorId: string, email: string, dealId: string) {
  if (!isStripeConfigured()) throw new Error('Payments are not set up yet.');
  const publishableKey = getPublishableKey();
  if (!publishableKey) throw new Error('Payments are not set up yet.');
  const state = await billingState(realtorId, email);
  if (!state.paymentRequired) throw new Error('This deal does not need a payment.');
  const intent = await getStripe().paymentIntents.create({
    amount: DEAL_PRICE_CENTS, currency: 'usd', automatic_payment_methods: { enabled: true },
    description: 'Closing Time deal: covers one deal from start to finish', receipt_email: email,
    metadata: { product: 'closing_time_deal', realtor_id: realtorId, deal_id: dealId },
  }, { idempotencyKey: `ct-deal-${realtorId}-${dealId}` });
  return { clientSecret: intent.client_secret, publishableKey, amountCents: DEAL_PRICE_CENTS, paymentIntentId: intent.id };
}

/** Confirms with Stripe that the payment went through before the deal is recorded as paid. */
export async function confirmDealPayment(realtorId: string, dealId: string, paymentIntentId: string): Promise<boolean> {
  await ensure();
  const intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
  const ok = intent.status === 'succeeded' && intent.amount === DEAL_PRICE_CENTS
    && intent.metadata?.product === 'closing_time_deal' && intent.metadata?.realtor_id === realtorId && intent.metadata?.deal_id === dealId;
  if (!ok) return false;
  await query(`INSERT INTO closing_time_deal_ledger (realtor_id, deal_id, kind, payment_intent_id, amount_cents) VALUES ($1,$2,'paid',$3,$4) ON CONFLICT DO NOTHING`, [realtorId, dealId, paymentIntentId, DEAL_PRICE_CENTS]);
  await logDealEvent(realtorId, dealId, 'payment', 'Deal opened. $12.00 paid by card.');
  return true;
}

/** The first extension on a deal is free. Each one after that costs $5. Owner accounts are exempt. */
export function extensionNeedsPayment(email: string, extensionsSoFar: number): boolean {
  return !isBillingExempt(email) && extensionsSoFar >= 1;
}

export async function createExtensionPayment(realtorId: string, email: string, dealId: string, extensionsSoFar: number) {
  if (!isStripeConfigured()) throw new Error('Payments are not set up yet.');
  const publishableKey = getPublishableKey();
  if (!publishableKey) throw new Error('Payments are not set up yet.');
  if (!extensionNeedsPayment(email, extensionsSoFar)) throw new Error('This extension does not need a payment.');
  const intent = await getStripe().paymentIntents.create({
    amount: EXTENSION_PRICE_CENTS, currency: 'usd', automatic_payment_methods: { enabled: true },
    description: 'Closing Time deal extension: 14 more days', receipt_email: email,
    metadata: { product: 'closing_time_extension', realtor_id: realtorId, deal_id: dealId },
  });
  return { clientSecret: intent.client_secret, publishableKey, amountCents: EXTENSION_PRICE_CENTS, paymentIntentId: intent.id };
}

export async function confirmExtensionPayment(realtorId: string, dealId: string, paymentIntentId: string): Promise<boolean> {
  await ensure();
  const intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
  const ok = intent.status === 'succeeded' && intent.amount === EXTENSION_PRICE_CENTS
    && intent.metadata?.product === 'closing_time_extension' && intent.metadata?.realtor_id === realtorId && intent.metadata?.deal_id === dealId;
  if (!ok) return false;
  const inserted = await query(`INSERT INTO closing_time_extension_ledger (payment_intent_id, realtor_id, deal_id, amount_cents) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING payment_intent_id`, [paymentIntentId, realtorId, dealId, EXTENSION_PRICE_CENTS]);
  if (inserted.length === 0) return false; // already used for an earlier extension
  await logDealEvent(realtorId, dealId, 'payment', 'Deal extended 14 days. $5.00 paid by card.');
  return true;
}
