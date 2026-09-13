import { withNeonTransaction } from '@/lib/server/db/neon';

type RecordInvoicePaymentInput = {
  invoiceId: string;
  amountCents: number;
  paymentDate: string;
  paymentMethod: string | null;
  reference: string | null;
  memo: string | null;
  source: string;
  externalId: string | null;
  createdBy: string | null;
};

type PaymentRow = Record<string, unknown> & {
  id: string;
  invoice_id: string;
};

export class InvoicePaymentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'InvoicePaymentError';
  }
}

/**
 * Records (or idempotently updates) a payment and recalculates the invoice in
 * one database transaction. Locking the invoice serializes balance checks, so
 * two concurrent requests cannot both spend the same remaining balance.
 */
export async function recordInvoicePayment(input: RecordInvoicePaymentInput) {
  return withNeonTransaction(async (client) => {
    const invoiceResult = await client.query<{
      id: string;
      total_cents: number;
      status: string;
    }>(
      `SELECT id, total_cents, status
         FROM invoices
        WHERE id = $1
        FOR UPDATE`,
      [input.invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new InvoicePaymentError('invoice not found', 404);
    if (invoice.status === 'void') {
      throw new InvoicePaymentError('cannot pay a void invoice', 400);
    }

    let existingPaymentId: string | null = null;
    if (input.externalId) {
      const existingResult = await client.query<{
        id: string;
        invoice_id: string;
      }>(
        `SELECT id, invoice_id
           FROM invoice_payments
          WHERE source = $1 AND external_id = $2
          FOR UPDATE`,
        [input.source, input.externalId],
      );
      const existing = existingResult.rows[0];
      if (existing && existing.invoice_id !== input.invoiceId) {
        throw new InvoicePaymentError(
          'external_id is already assigned to another invoice',
          409,
        );
      }
      existingPaymentId = existing?.id ?? null;
    }

    const paidResult = await client.query<{ amount_paid_cents: number }>(
      `SELECT COALESCE(sum(amount_cents), 0)::int AS amount_paid_cents
         FROM invoice_payments
        WHERE invoice_id = $1
          AND ($2::uuid IS NULL OR id <> $2::uuid)`,
      [input.invoiceId, existingPaymentId],
    );
    const previouslyPaidCents = Number(
      paidResult.rows[0]?.amount_paid_cents ?? 0,
    );
    const totalCents = Number(invoice.total_cents);
    const amountPaidCents = previouslyPaidCents + input.amountCents;
    if (amountPaidCents > totalCents) {
      throw new InvoicePaymentError(
        `payment exceeds remaining balance of ${Math.max(totalCents - previouslyPaidCents, 0)} cents`,
        400,
      );
    }

    const paymentResult = await client.query<PaymentRow>(
      `INSERT INTO invoice_payments (
         invoice_id, amount_cents, payment_date, payment_method,
         reference, memo, source, external_id, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
       DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents,
         payment_date = EXCLUDED.payment_date,
         payment_method = EXCLUDED.payment_method,
         reference = EXCLUDED.reference,
         memo = EXCLUDED.memo,
         updated_at = now()
       WHERE invoice_payments.invoice_id = EXCLUDED.invoice_id
       RETURNING *`,
      [
        input.invoiceId,
        input.amountCents,
        input.paymentDate,
        input.paymentMethod,
        input.reference,
        input.memo,
        input.source,
        input.externalId,
        input.createdBy,
      ],
    );
    const payment = paymentResult.rows[0];
    // Covers a cross-invoice unique-key race that began before either request
    // could observe the other's external payment.
    if (!payment) {
      throw new InvoicePaymentError(
        'external_id is already assigned to another invoice',
        409,
      );
    }

    const fullyPaid = amountPaidCents === totalCents;
    await client.query(
      `UPDATE invoices
          SET status = CASE
                WHEN $2 THEN 'paid'
                WHEN due_date < CURRENT_DATE THEN 'overdue'
                ELSE 'sent'
              END,
              paid_at = CASE
                WHEN $2 THEN ($3::date + time '12:00') AT TIME ZONE 'UTC'
                ELSE NULL
              END
        WHERE id = $1`,
      [input.invoiceId, fullyPaid, input.paymentDate],
    );

    return {
      payment,
      amountPaidCents,
      balanceCents: totalCents - amountPaidCents,
    };
  });
}
