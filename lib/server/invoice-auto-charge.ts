// lib/server/invoice-auto-charge.ts
//
// "Card on file, auto-charge on invoice creation."
//
// Resolves the saved (off-session) card for an invoice and charges it, using
// the exact same Stripe pattern as
// app/api/admin/agreements/[id]/charge-issue/route.ts: the agreement is the
// single source of truth for `stripe_customer_id` + `stripe_payment_method_id`
// (populated by the sign-wizard flow with setup_future_usage:'off_session').
// `advertisers.card_last4` / `payment_mode` are a read-only mirror kept in
// sync by lib/server/billing-crm-sync.ts and are only used for display.
//
// Nothing in here writes to the advertiser mirror columns.

import { getSql } from '@/lib/db';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { recordInvoicePayment, InvoicePaymentError } from '@/lib/server/invoice-payments';
import { isCardExpired, EXPIRED_CARD_CHARGE_ERROR } from '@/lib/card-expiration';

export type ResolvedCardOnFile = {
  agreementId: string;
  customerId: string;
  paymentMethodId: string;
  companyName: string | null;
  receiptEmail: string | null;
  /** Raw agreements.card_expiration, "MM/YY" (may be null on legacy rows). */
  cardExpiration: string | null;
};

type AgreementCardRow = {
  id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  company_name: string | null;
  advertiser_email: string | null;
  billing_email: string | null;
  card_expiration: string | null;
};

/**
 * Find a usable off-session card for an invoice.
 *
 * - When the invoice is linked to an agreement, that agreement must itself
 *   carry both Stripe ids — an admin who explicitly picked an agreement should
 *   never have a *different* agreement's card charged.
 * - When no agreement is linked, fall back to the advertiser's most recently
 *   updated agreement that has both ids (advertisers have no
 *   `stripe_payment_method_id` column of their own, only a display mirror).
 *
 * Returns null when no card is on file.
 *
 * An EXPIRED card is still resolved (not filtered out): hiding it would make
 * the auto-charge checkbox silently disappear with no explanation, and admins
 * would have no idea why. Instead the drawer shows an "expires MM/YY — update
 * before charging" warning and autoChargeInvoice() fails fast with a clear
 * error before ever calling Stripe.
 */
export async function resolveCardOnFile(params: {
  advertiserId: number;
  agreementId: string | null;
}): Promise<ResolvedCardOnFile | null> {
  const sql = getSql();
  const rows = params.agreementId
    ? ((await sql`
        SELECT id, stripe_customer_id, stripe_payment_method_id, company_name, advertiser_email, billing_email, card_expiration
          FROM agreements
         WHERE id = ${params.agreementId}
         LIMIT 1
      `) as unknown as AgreementCardRow[])
    : ((await sql`
        SELECT id, stripe_customer_id, stripe_payment_method_id, company_name, advertiser_email, billing_email, card_expiration
          FROM agreements
         WHERE advertiser_id = ${params.advertiserId}
           AND stripe_customer_id IS NOT NULL
           AND stripe_payment_method_id IS NOT NULL
         ORDER BY updated_at DESC
         LIMIT 1
      `) as unknown as AgreementCardRow[]);

  const row = rows[0];
  if (!row?.stripe_customer_id || !row.stripe_payment_method_id) return null;
  return {
    agreementId: row.id,
    customerId: row.stripe_customer_id,
    paymentMethodId: row.stripe_payment_method_id,
    companyName: row.company_name,
    receiptEmail: row.advertiser_email ?? row.billing_email ?? null,
    cardExpiration: row.card_expiration ?? null,
  };
}

/** Append one entry to invoices.audit_log, matching the PATCH route's pattern. */
export async function appendInvoiceAudit(
  invoiceId: string,
  entry: { event: string; user_email?: string | null; details?: string | null },
): Promise<void> {
  const sql = getSql();
  const payload = JSON.stringify([{ ...entry, timestamp: new Date().toISOString() }]);
  await sql`
    UPDATE invoices
       SET audit_log = COALESCE(audit_log, '[]'::jsonb) || ${payload}::jsonb,
           updated_at = NOW()
     WHERE id = ${invoiceId}
  `;
}

export type AutoChargeResult =
  | { ok: true; paymentIntentId: string }
  | { ok: false; error: string };

/**
 * Charge the saved card off-session for the full invoice total and record the
 * result on the invoice ledger. Never throws: invoice creation must survive a
 * declined card, so every failure comes back as `{ ok: false, error }` for the
 * caller to surface as a warning.
 *
 * The invoice must already be issued (non-draft) — the ledger refuses payments
 * against drafts (see assertInvoicePayable).
 */
export async function autoChargeInvoice(params: {
  invoiceId: string;
  invoiceNumber: string | null;
  totalCents: number;
  card: ResolvedCardOnFile;
  adminEmail: string | null;
}): Promise<AutoChargeResult> {
  const { invoiceId, totalCents, card, adminEmail } = params;
  if (!isStripeConfigured()) {
    return { ok: false, error: 'Stripe is not configured (STRIPE_SECRET_KEY missing).' };
  }
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return { ok: false, error: 'Invoice total must be greater than zero to auto-charge a card.' };
  }
  // Fail fast on an expired card rather than sending Stripe a charge that is
  // guaranteed to decline (and would leave a failed PaymentIntent behind).
  // Unparseable/missing expirations are treated as unknown, never as expired.
  if (isCardExpired(card.cardExpiration)) {
    return { ok: false, error: EXPIRED_CARD_CHARGE_ERROR };
  }

  const sql = getSql();
  const stripe = getStripe();

  let paymentIntentId: string;
  let succeeded: boolean;
  try {
    // The invoice total is charged as-is: unlike agreement issue charges, the
    // invoice amount already reflects whatever the admin billed.
    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: card.customerId,
      payment_method: card.paymentMethodId,
      off_session: true,
      confirm: true,
      description: `${card.companyName ?? 'Partner'} \u2014 ${params.invoiceNumber ?? 'Invoice'}`,
      statement_descriptor_suffix: 'REALTYLINE AUSTIN',
      receipt_email: card.receiptEmail ?? undefined,
      // `source` intentionally is NOT one of the webhook-owned values
      // ('invoice_payment' / 'statement_payment' / 'self_serve_checkout') and
      // no agreement_id is sent, so the Stripe webhook will not double-record
      // this payment or mutate the agreement.
      metadata: {
        source: 'invoice_auto_charge',
        invoice_id: invoiceId,
        invoice_number: params.invoiceNumber ?? '',
        agreement_id_ref: card.agreementId,
        publication: 'RealtyLine',
      },
    });
    paymentIntentId = pi.id;
    succeeded = pi.status === 'succeeded';
    if (!succeeded) {
      return { ok: false, error: `Card charge did not complete (status: ${pi.status}).` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'card charge failed' };
  }

  // Charge went through — persist the Stripe ids before touching the ledger so
  // a later failure still leaves the PaymentIntent traceable from the invoice.
  await sql`
    UPDATE invoices
       SET stripe_payment_intent_id = ${paymentIntentId},
           stripe_customer_id = ${card.customerId}
     WHERE id = ${invoiceId}
  `;

  try {
    await recordInvoicePayment({
      invoiceId,
      amountCents: totalCents,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Credit card',
      reference: paymentIntentId,
      memo: 'Auto-charged card on file at invoice creation',
      // Distinct from 'manual' and from the webhook-reserved 'stripe' /
      // 'stripe_statement' sources, so the (source, external_id) upsert key
      // can never collide with a webhook-owned row.
      source: 'stripe_auto_charge',
      externalId: paymentIntentId,
      createdBy: adminEmail,
    });
  } catch (err) {
    const detail =
      err instanceof InvoicePaymentError || err instanceof Error ? err.message : 'unknown error';
    return {
      ok: false,
      error: `Card was charged (${paymentIntentId}) but the payment could not be recorded on the invoice: ${detail}. Record it manually.`,
    };
  }

  return { ok: true, paymentIntentId };
}
