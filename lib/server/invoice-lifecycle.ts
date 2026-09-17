// lib/server/invoice-lifecycle.ts
//
// Central, transactional primitives for every invoice/payment mutation in
// Get Paid. Before this file, invoice status/paid_at recalculation and
// Stripe Checkout Session invalidation were duplicated (or missing) across
// a dozen routes, which is how invoices could stay "paid" after a payment
// was deleted, or an old Checkout URL could still charge a card after a
// newer link/payment made it stale. Every ledger-affecting route should go
// through these functions instead of hand-rolling its own UPDATE/expire
// logic.
//
// All functions here take a `PoolClient` that already has an open
// transaction (see lib/server/db/neon.ts `withNeonTransaction`) so locking
// and recalculation happen atomically with the caller's own writes.

import type { PoolClient } from '@neondatabase/serverless';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

export class InvoiceLifecycleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'InvoiceLifecycleError';
  }
}

export type InvoiceStatusRow = {
  id: string;
  total_cents: number;
  status: string;
  paid_at: string | null;
};

/**
 * Lock the invoice row and recompute status/paid_at purely from
 * `SUM(invoice_payments.amount_cents)` vs. `total_cents`. This is the single
 * place that decides "is this invoice paid" \u2014 callers must never set
 * `status='paid'` directly. Void invoices are left untouched (voiding is a
 * terminal, explicit action, not something the ledger should undo).
 *
 * Returns the invoice's new state so callers can react (e.g. skip session
 * invalidation when nothing changed).
 */
export async function recalculateInvoiceFromLedger(
  client: PoolClient,
  invoiceId: string,
  opts: { paidAtDate?: string } = {},
): Promise<InvoiceStatusRow | null> {
  const invoiceResult = await client.query<{ total_cents: number; status: string }>(
    `SELECT total_cents, status FROM invoices WHERE id = $1 FOR UPDATE`,
    [invoiceId],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return null;
  if (invoice.status === 'void') {
    return { id: invoiceId, total_cents: Number(invoice.total_cents), status: 'void', paid_at: null };
  }

  const paidResult = await client.query<{ amount_paid_cents: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS amount_paid_cents
       FROM invoice_payments WHERE invoice_id = $1`,
    [invoiceId],
  );
  const amountPaidCents = Number(paidResult.rows[0]?.amount_paid_cents ?? 0);
  const totalCents = Number(invoice.total_cents);
  const fullyPaid = totalCents > 0 && amountPaidCents >= totalCents;
  const paidTimestamp = opts.paidAtDate ? `${opts.paidAtDate}T12:00:00.000Z` : null;

  const updated = await client.query<{ status: string; paid_at: string | null }>(
    `UPDATE invoices
        SET status = CASE
              WHEN $2 THEN 'paid'
              WHEN due_date < CURRENT_DATE THEN 'overdue'
              ELSE 'sent'
            END,
            paid_at = CASE
              WHEN $2 THEN COALESCE($3::timestamptz, paid_at, NOW())
              ELSE NULL
            END
      WHERE id = $1
        AND status <> 'void'
      RETURNING status, paid_at`,
    [invoiceId, fullyPaid, paidTimestamp],
  );

  revalidateInvoiceViews(invoiceId);
  const row = updated.rows[0];
  return {
    id: invoiceId,
    total_cents: totalCents,
    status: row?.status ?? invoice.status,
    paid_at: row?.paid_at ?? null,
  };
}

/**
 * Expire every open Checkout Session (individual + statement-allocation) for
 * one invoice, inside the caller's transaction. Call this after ANY ledger
 * mutation \u2014 manual payment, payment delete, Stripe payment, void, amount
 * edit, or invoice delete \u2014 not just from the Stripe webhook. Stripe API
 * failures are distinguished from "already terminal" so a transient network
 * error never causes us to silently believe a session was revoked.
 */
export async function invalidateInvoiceCheckoutSessions(
  client: PoolClient,
  invoiceId: string,
): Promise<void> {
  const openSessions = await client.query<{ id: string; stripe_checkout_session_id: string | null }>(
    `SELECT id, stripe_checkout_session_id
       FROM invoice_checkout_sessions
      WHERE invoice_id = $1 AND status IN ('creating', 'open')
      FOR UPDATE`,
    [invoiceId],
  );

  const statementSessions = await client.query<{ id: string; stripe_checkout_session_id: string | null }>(
    `SELECT id, stripe_checkout_session_id
       FROM statement_payment_sessions
      WHERE status = 'open'
        AND invoice_allocations @> $1::jsonb
      FOR UPDATE`,
    [JSON.stringify([{ invoiceId }])],
  );

  const stripeConfigured = isStripeConfigured();
  const stripe = stripeConfigured ? getStripe() : null;

  for (const row of openSessions.rows) {
    const terminal = await expireStripeSession(stripe, row.stripe_checkout_session_id);
    if (terminal) {
      await client.query(
        `UPDATE invoice_checkout_sessions
            SET status = 'expired'
          WHERE id = $1 AND status IN ('creating', 'open')`,
        [row.id],
      );
    } else {
      await client.query(
        `UPDATE invoice_checkout_sessions
            SET status = 'expired'
          WHERE id = $1 AND status = 'creating'`,
        [row.id],
      );
      // Leave 'open' rows alone when Stripe expiration failed transiently \u2014
      // the session may still be genuinely payable and we must not lose the
      // ability to retry revocation. A repair sweep can retry these.
    }
  }

  for (const row of statementSessions.rows) {
    const terminal = await expireStripeSession(stripe, row.stripe_checkout_session_id);
    if (terminal) {
      await client.query(
        `UPDATE statement_payment_sessions SET status = 'expired' WHERE id = $1 AND status = 'open'`,
        [row.id],
      );
    }
  }
}

/**
 * Expire a Stripe Checkout Session and return whether the LOCAL record can
 * safely be marked terminal. Returns true when Stripe confirms the session
 * is expired/complete (including "already expired/complete" errors), and
 * false on any transient/ambiguous failure (network, auth, rate limit) \u2014
 * those must NOT be treated as success.
 */
async function expireStripeSession(
  stripe: ReturnType<typeof getStripe> | null,
  sessionId: string | null,
): Promise<boolean> {
  if (!sessionId) return true;
  if (!stripe) return false;
  try {
    const session = await stripe.checkout.sessions.expire(sessionId);
    return session.status === 'expired' || session.status === 'complete';
  } catch (err) {
    const stripeErr = err as { code?: string; type?: string; statusCode?: number };
    // Stripe returns an invalid_request_error / resource_missing-ish error
    // when the session is already expired or already paid \u2014 both are
    // genuinely terminal, so it's safe to mark local state expired.
    if (stripeErr?.type === 'StripeInvalidRequestError') {
      try {
        const existing = await stripe.checkout.sessions.retrieve(sessionId);
        return existing.status === 'expired' || existing.status === 'complete';
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Allocate the next number in an atomic per-series counter. Replaces racy
 * `COUNT(*)+1` / `MAX(*)+1` numbering that can collide under concurrency or
 * after a row is deleted. Call inside a transaction; the UPDATE...RETURNING
 * takes a row lock so concurrent callers serialize instead of colliding.
 */
export async function nextDocumentNumber(client: PoolClient, series: string): Promise<number> {
  const result = await client.query<{ next_value: number }>(
    `INSERT INTO document_number_counters (series, next_value)
     VALUES ($1, 2)
     ON CONFLICT (series) DO UPDATE SET next_value = document_number_counters.next_value + 1
     RETURNING next_value - 1 AS next_value`,
    [series],
  );
  return Number(result.rows[0].next_value);
}

/**
 * Reject payment instruments (Checkout Sessions, manual payments) against
 * invoices that are not in a payable lifecycle state. Drafts are excluded
 * deliberately \u2014 an unissued invoice should not be collectible until it's
 * been sent, otherwise it can be paid while still excluded from statements
 * and receivables views.
 */
export function assertInvoicePayable(invoice: { status: string }): void {
  if (invoice.status === 'void') {
    throw new InvoiceLifecycleError('cannot record a payment against a void invoice', 400);
  }
  if (invoice.status === 'draft') {
    throw new InvoiceLifecycleError('cannot record a payment against a draft invoice \u2014 issue it first', 400);
  }
}

/**
 * Insert a new Checkout Session row atomically, enforcing at most one live
 * (creating|open) session per invoice via the partial unique index. Callers
 * must call `invalidateInvoiceCheckoutSessions` first inside the SAME
 * transaction so a prior open session is expired before this insert, or the
 * unique index will raise 23505 and the caller should surface a 409.
 */
export async function registerInvoiceCheckoutSession(
  client: PoolClient,
  params: { invoiceId: string; baseAmountCents: number; createdBy: string | null },
): Promise<{ id: string; linkGeneration: number }> {
  const prior = await client.query<{ link_generation: number }>(
    `SELECT link_generation FROM invoice_checkout_sessions
      WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [params.invoiceId],
  );
  const linkGeneration = (prior.rows[0]?.link_generation ?? 0) + 1;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO invoice_checkout_sessions (invoice_id, base_amount_cents, link_generation, created_by, status)
     VALUES ($1, $2, $3, $4, 'creating')
     RETURNING id`,
    [params.invoiceId, params.baseAmountCents, linkGeneration, params.createdBy],
  );
  return { id: inserted.rows[0].id, linkGeneration };
}

export async function markCheckoutSessionOpen(
  client: PoolClient,
  registryId: string,
  stripeSession: { id: string; url: string | null },
): Promise<void> {
  await client.query(
    `UPDATE invoice_checkout_sessions
        SET status = 'open', stripe_checkout_session_id = $2, checkout_url = $3
      WHERE id = $1`,
    [registryId, stripeSession.id, stripeSession.url],
  );
}

export async function markCheckoutSessionFailed(client: PoolClient, registryId: string): Promise<void> {
  await client.query(
    `UPDATE invoice_checkout_sessions SET status = 'failed' WHERE id = $1`,
    [registryId],
  );
}

/**
 * Compute the current remaining balance for an invoice, locked. Use this
 * instead of `total_cents` anywhere a Checkout Session or payment amount is
 * about to be created \u2014 charging the original total on a partially paid
 * invoice is a direct overcharge.
 */
export async function lockInvoiceRemainingBalance(
  client: PoolClient,
  invoiceId: string,
): Promise<{ invoice: { id: string; total_cents: number; status: string }; remainingCents: number }> {
  const invoiceResult = await client.query<{ id: string; total_cents: number; status: string }>(
    `SELECT id, total_cents, status FROM invoices WHERE id = $1 FOR UPDATE`,
    [invoiceId],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) throw new InvoiceLifecycleError('invoice not found', 404);
  assertInvoicePayable(invoice);

  const paidResult = await client.query<{ cents: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS cents FROM invoice_payments WHERE invoice_id = $1`,
    [invoiceId],
  );
  const remainingCents = Number(invoice.total_cents) - Number(paidResult.rows[0].cents);
  if (!Number.isSafeInteger(remainingCents) || remainingCents <= 0) {
    throw new InvoiceLifecycleError('invoice has no amount due', 409);
  }
  return { invoice, remainingCents };
}
