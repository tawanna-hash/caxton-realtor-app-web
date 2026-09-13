import type Stripe from 'stripe';
import type { getSql } from '@/lib/db';
import type { Agreement } from '@/lib/agreements';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

type Sql = ReturnType<typeof getSql>;

type InvoiceRow = {
  id: string;
  total_cents: number;
  status: string;
};

function positiveMetadataCents(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function paymentDate(created: number): string {
  return new Date(created * 1000).toISOString().slice(0, 10);
}

function paymentMethod(pi: Stripe.PaymentIntent): string {
  switch (pi.metadata?.payment_method_selection) {
    case 'ach':
      return 'Stripe ACH';
    case 'bnpl':
      return 'Stripe Buy Now, Pay Later';
    default:
      return 'Stripe Card';
  }
}

function paymentMemo(pi: Stripe.PaymentIntent, baseAmountCents: number): string {
  const feeCents =
    positiveMetadataCents(pi.metadata?.processing_fee_cents) ??
    positiveMetadataCents(pi.metadata?.surcharge_cents) ??
    Math.max(pi.amount_received - baseAmountCents, 0);
  const gross = (pi.amount_received / 100).toFixed(2);
  const fee = (feeCents / 100).toFixed(2);
  return `Stripe payment ${pi.id}; gross $${gross}; processing fee $${fee}`;
}

/**
 * Recompute the invoice state from the payment ledger. This is deliberately
 * shared by success and refund handling so neither trusts a stale paid flag.
 */
export async function recalculateStripeInvoice(
  sql: Sql,
  invoiceId: string,
  paidAtDate?: string,
): Promise<void> {
  const rows = (await sql`
    SELECT i.total_cents, i.status,
           COALESCE(sum(p.amount_cents), 0)::int AS amount_paid_cents
      FROM invoices i
      LEFT JOIN invoice_payments p ON p.invoice_id = i.id
     WHERE i.id = ${invoiceId}
     GROUP BY i.id, i.total_cents, i.status
  `) as unknown as Array<{
    total_cents: number;
    status: string;
    amount_paid_cents: number;
  }>;
  if (rows.length === 0 || rows[0].status === 'void') return;

  const fullyPaid = Number(rows[0].amount_paid_cents) >= Number(rows[0].total_cents);
  const paidTimestamp = paidAtDate ? `${paidAtDate}T12:00:00.000Z` : null;
  await sql`
    UPDATE invoices
       SET status = CASE
             WHEN ${fullyPaid} THEN 'paid'
             WHEN due_date < CURRENT_DATE THEN 'overdue'
             ELSE 'sent'
           END,
           paid_at = CASE
             WHEN ${fullyPaid}
               THEN COALESCE(${paidTimestamp}::timestamptz, paid_at, NOW())
             ELSE NULL
           END,
           updated_at = NOW()
     WHERE id = ${invoiceId}
       AND status <> 'void'
  `;
  revalidateInvoiceViews(invoiceId);
}

/**
 * Record the base invoice amount, not Stripe's disclosed processing fee, in
 * accounts receivable. The Stripe PaymentIntent is the stable external key.
 */
export async function upsertStripeInvoicePayment(
  sql: Sql,
  invoiceId: string,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const invoices = (await sql`
    SELECT id, total_cents, status FROM invoices WHERE id = ${invoiceId}
  `) as unknown as InvoiceRow[];
  if (invoices.length === 0) {
    throw new Error(`invoice ${invoiceId} not found for Stripe payment ${pi.id}`);
  }
  if (invoices[0].status === 'void') {
    throw new Error(`cannot apply Stripe payment ${pi.id} to void invoice ${invoiceId}`);
  }

  const baseAmountCents =
    positiveMetadataCents(pi.metadata?.base_amount_cents) ??
    Math.min(pi.amount_received, Number(invoices[0].total_cents));
  if (baseAmountCents <= 0) {
    throw new Error(`Stripe payment ${pi.id} has no positive invoice amount`);
  }
  const date = paymentDate(pi.created);

  await sql`
    INSERT INTO invoice_payments (
      invoice_id, amount_cents, payment_date, payment_method,
      reference, memo, source, external_id, created_by
    ) VALUES (
      ${invoiceId}, ${baseAmountCents}, ${date}, ${paymentMethod(pi)},
      ${pi.id}, ${paymentMemo(pi, baseAmountCents)}, 'stripe', ${pi.id}, 'stripe_webhook'
    )
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
      invoice_id = EXCLUDED.invoice_id,
      amount_cents = EXCLUDED.amount_cents,
      payment_date = EXCLUDED.payment_date,
      payment_method = EXCLUDED.payment_method,
      reference = EXCLUDED.reference,
      memo = EXCLUDED.memo,
      updated_at = NOW()
  `;
  await sql`
    UPDATE invoices
       SET stripe_payment_intent_id = ${pi.id},
           stripe_customer_id = COALESCE(
             ${typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null},
             stripe_customer_id
           ),
           updated_at = NOW()
     WHERE id = ${invoiceId}
  `;
  await recalculateStripeInvoice(sql, invoiceId, date);
}

/**
 * Create a sales-receipt-shaped Get Paid record for an Agreement charge.
 * We only do this when the Agreement has a Partner and a positive base amount.
 * The deterministic SR number and ledger external ID make concurrent webhook
 * deliveries safe.
 */
export async function syncAgreementPaymentToGetPaid(
  sql: Sql,
  agreement: Agreement,
  pi: Stripe.PaymentIntent,
): Promise<string | null> {
  if (!agreement.advertiser_id) return null;

  const baseAmountCents =
    positiveMetadataCents(pi.metadata?.base_amount_cents) ??
    (agreement.amount_cents && agreement.amount_cents > 0 ? agreement.amount_cents : null);
  if (!baseAmountCents) return null;

  const existing = (await sql`
    SELECT id, total_cents, status
      FROM invoices
     WHERE stripe_payment_intent_id = ${pi.id}
        OR number = ${`SR-STRIPE-${pi.id}`}
     ORDER BY CASE WHEN stripe_payment_intent_id = ${pi.id} THEN 0 ELSE 1 END
     LIMIT 1
  `) as unknown as InvoiceRow[];

  let invoiceId = existing[0]?.id;
  if (!invoiceId) {
    const lineItems = JSON.stringify([{
      description: pi.description ?? agreement.ad_size ?? 'Agreement payment',
      qty: 1,
      unit_cents: baseAmountCents,
    }]);
    const inserted = (await sql`
      INSERT INTO invoices (
        advertiser_id, agreement_id, number, amount_cents, tax_cents, status,
        stripe_payment_intent_id, stripe_customer_id, issued_at, due_date,
        bill_to_name, bill_to_email, bill_to_address, memo, line_items, created_by
      ) VALUES (
        ${agreement.advertiser_id}, ${agreement.id}, ${`SR-STRIPE-${pi.id}`},
        ${baseAmountCents}, 0, 'sent', ${pi.id},
        ${typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? agreement.stripe_customer_id},
        ${new Date(pi.created * 1000).toISOString()}, ${paymentDate(pi.created)},
        ${agreement.billing_name ?? agreement.company_name ?? agreement.rep_name},
        ${agreement.billing_email ?? agreement.advertiser_email},
        ${agreement.cardholder_address ?? agreement.advertiser_address},
        ${`Stripe sales receipt for Agreement ${agreement.id}`},
        ${lineItems}::jsonb, 'stripe_webhook'
      )
      ON CONFLICT (number) DO UPDATE SET
        stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, invoices.stripe_customer_id),
        updated_at = NOW()
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    invoiceId = inserted[0]?.id;
  }
  if (!invoiceId) return null;

  await upsertStripeInvoicePayment(sql, invoiceId, pi);
  return invoiceId;
}

/**
 * Reconcile a cumulative Stripe refund against the positive-only payment
 * ledger. Full refunds remove the external payment; partial refunds reduce it
 * to the remaining base amount. Calling this repeatedly converges on Stripe's
 * current cumulative amount_refunded.
 */
export async function reconcileStripeRefundInGetPaid(
  sql: Sql,
  pi: Stripe.PaymentIntent,
  charge: Stripe.Charge,
): Promise<string[]> {
  const payments = (await sql`
    SELECT invoice_id, amount_cents
      FROM invoice_payments
     WHERE source = 'stripe' AND external_id = ${pi.id}
  `) as unknown as Array<{ invoice_id: string; amount_cents: number }>;
  if (payments.length === 0) {
    // Legacy webhook handling marked invoices paid without creating a ledger
    // row. Reopen any such invoice by its PaymentIntent during backfill/replay.
    const legacyInvoices = (await sql`
      UPDATE invoices
         SET status = CASE WHEN due_date < CURRENT_DATE THEN 'overdue' ELSE 'sent' END,
             paid_at = NULL,
             updated_at = NOW()
       WHERE stripe_payment_intent_id = ${pi.id}
         AND status <> 'void'
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    const invoiceIds = legacyInvoices.map((invoice) => invoice.id);
    for (const invoiceId of invoiceIds) revalidateInvoiceViews(invoiceId);
    return invoiceIds;
  }

  const originalBase =
    positiveMetadataCents(pi.metadata?.base_amount_cents) ??
    Number(payments[0].amount_cents);
  const remainingBase = charge.refunded
    ? 0
    : Math.max(originalBase - Math.min(charge.amount_refunded, originalBase), 0);

  if (remainingBase > 0) {
    await sql`
      UPDATE invoice_payments
         SET amount_cents = ${remainingBase},
             memo = ${`${paymentMemo(pi, originalBase)}; refunded $${(charge.amount_refunded / 100).toFixed(2)} via ${charge.id}`},
             updated_at = NOW()
       WHERE source = 'stripe' AND external_id = ${pi.id}
    `;
  } else {
    await sql`
      DELETE FROM invoice_payments
       WHERE source = 'stripe' AND external_id = ${pi.id}
    `;
  }

  const invoiceIds = [...new Set(payments.map((payment) => payment.invoice_id))];
  for (const invoiceId of invoiceIds) {
    await recalculateStripeInvoice(sql, invoiceId);
  }
  return invoiceIds;
}
