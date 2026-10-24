// lib/agreements-v2/service-invoice.ts
//
// e-Blast / app / digital agreements are paid before service is scheduled, so
// signing always leaves an invoice behind:
//   - card paid at signing  -> a paid sales-receipt invoice
//   - approved check        -> an open invoice marked "Awaiting check payment"
//                              (paid and the hold released when an admin
//                              confirms the check arrived)
//   - ACH / card sent to Accounts Payable -> the Stripe webhook creates the
//                              paid invoice when the payment succeeds
// Print is invoiced net 20 elsewhere and is never touched here.

import type { getSql } from '@/lib/db';
import type { Agreement } from '@/lib/agreements';
import { allocateInvoiceNumber } from '@/lib/server/invoice-lifecycle';
import { recordInvoicePayment } from '@/lib/server/invoice-payments';
import { getStripe } from '@/lib/stripe';
import { syncAgreementPaymentToGetPaid } from '@/lib/server/stripe-payment-ledger-sync';

type Sql = ReturnType<typeof getSql>;

async function isDigital(sql: Sql, ag: Agreement): Promise<boolean> {
  const rows = (await sql`
    SELECT (COALESCE(${(ag as Agreement & { channel?: string | null }).channel ?? null}, CASE WHEN ${ag.type ?? ''} IN ('print_ad', 'package') THEN 'print' ELSE 'digital' END) <> 'print'
      OR EXISTS (SELECT 1 FROM agreement_line_items li WHERE li.agreement_id = ${ag.id} AND li.channel <> 'print')) AS digital
  `) as unknown as Array<{ digital: boolean }>;
  return Boolean(rows[0]?.digital);
}

export async function ensureServiceInvoiceAfterSign(sql: Sql, ag: Agreement): Promise<string> {
  if (!ag.advertiser_id) return 'skipped:no-partner';
  if (!(await isDigital(sql, ag))) return 'skipped:print';
  const existing = (await sql`
    SELECT id FROM invoices WHERE agreement_id = ${ag.id} AND status <> 'void' LIMIT 1
  `) as unknown as Array<{ id: string }>;
  if (existing[0]) return 'skipped:exists';

  // Card charged at signing: build the paid receipt now (the webhook may have
  // fired before the partner existed).
  if (ag.stripe_payment_intent_id) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(ag.stripe_payment_intent_id);
      if (pi.status === 'succeeded') {
        const id = await syncAgreementPaymentToGetPaid(sql, ag, pi);
        return id ? 'paid-receipt' : 'skipped:no-amount';
      }
    } catch (e) {
      console.error('[service-invoice] card receipt failed', e instanceof Error ? e.message : e);
    }
    return 'skipped:card-pending';
  }

  if (ag.payment_mode !== 'check') return 'skipped:awaiting-online-payment';

  const bundle = (await sql`
    SELECT COALESCE(SUM(amount_cents), 0)::int AS cents FROM agreement_line_items WHERE agreement_id = ${ag.id}
  `.catch(() => [{ cents: 0 }])) as unknown as Array<{ cents: number }>;
  const amount = Number(bundle[0]?.cents) > 0 ? Number(bundle[0].cents) : Number(ag.amount_cents ?? 0);
  if (!(amount > 0)) return 'skipped:no-amount';

  const number = await allocateInvoiceNumber(sql as never);
  const today = new Date().toISOString().slice(0, 10);
  const inserted = (await sql`
    INSERT INTO invoices (
      advertiser_id, agreement_id, number, amount_cents, tax_cents, status, awaiting_check,
      issued_at, due_date, bill_to_name, bill_to_email, bill_to_address, memo, line_items, created_by
    ) VALUES (
      ${ag.advertiser_id}, ${ag.id}, ${number}, ${amount}, 0, 'sent', true,
      NOW(), ${today},
      ${ag.billing_name ?? ag.company_name ?? ag.rep_name},
      ${ag.billing_email ?? ag.advertiser_email},
      ${ag.cardholder_address ?? ag.advertiser_address},
      ${'Awaiting check payment. Service will not be scheduled until the check is received.'},
      ${JSON.stringify([{ description: ag.ad_size ?? 'Digital advertising', qty: 1, unit_cents: amount }])}::jsonb,
      'agreement_signing'
    ) RETURNING id
  `) as unknown as Array<{ id: string }>;
  return inserted[0] ? 'awaiting-check' : 'failed';
}

/** Admin confirms payment arrived: pay out any open awaiting-check invoice. */
export async function payAwaitingCheckInvoices(sql: Sql, agreementId: string, actor: string | null): Promise<number> {
  const rows = (await sql`
    SELECT i.id, i.total_cents,
           COALESCE((SELECT SUM(amount_cents) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)::int AS paid
      FROM invoices i
     WHERE i.agreement_id = ${agreementId} AND i.status IN ('sent', 'overdue')
  `) as unknown as Array<{ id: string; total_cents: number; paid: number }>;
  let n = 0;
  for (const r of rows) {
    const remaining = Number(r.total_cents) - Number(r.paid);
    if (remaining > 0) {
      await recordInvoicePayment({
        invoiceId: r.id,
        amountCents: remaining,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'check',
        reference: null,
        memo: 'Check received (confirmed from agreement)',
        source: 'manual',
        externalId: null,
        createdBy: actor,
      });
      n++;
    }
    await sql`UPDATE invoices SET awaiting_check = false, updated_at = NOW() WHERE id = ${r.id}`;
  }
  return n;
}
