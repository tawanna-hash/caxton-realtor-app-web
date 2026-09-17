// app/api/admin/sales-receipts/route.ts
//
// POST — create a sales receipt AND its full payment atomically.
//
// Audit finding (UI #17 / API #16): the previous client flow issued two
// separate requests — create a 'sent' invoice, then record its payment.
// If the second request failed or the browser disconnected, an unpaid
// invoice was left behind even though the user was creating a paid
// receipt, and retrying created a duplicate. This endpoint does both
// writes inside one database transaction with a client-supplied
// idempotency key, so a retry after a network failure returns the
// original receipt instead of creating a second one.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { isSafeCents, isIsoCalendarDate, type InvoiceLineItem } from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { nextDocumentNumber, recalculateInvoiceFromLedger } from '@/lib/server/invoice-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

// Idempotency keys are client-generated (e.g. a UUID minted once per drawer
// submission) and namespaced server-side by admin, so one admin's retry
// can never collide with another admin's concurrently-submitted key.
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export const POST = withAdminTracking(async (req: NextRequest) => {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const advertiserId = Number(body.advertiser_id);
  if (!Number.isInteger(advertiserId) || advertiserId < 1) {
    return NextResponse.json({ error: 'advertiser_id is required' }, { status: 400 });
  }
  const lineItems = Array.isArray(body.line_items) ? (body.line_items as InvoiceLineItem[]) : [];
  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'at least one line item is required' }, { status: 400 });
  }
  const amountCents = Number(body.amount_cents);
  if (!isSafeCents(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: 'amount_cents must be a positive, safe integer' }, { status: 400 });
  }
  const receiptDate = typeof body.receipt_date === 'string' ? body.receipt_date.slice(0, 10) : '';
  if (!isIsoCalendarDate(receiptDate)) {
    return NextResponse.json({ error: 'receipt_date must be a valid ISO calendar date' }, { status: 400 });
  }
  const paymentMethod = typeof body.payment_method === 'string' && body.payment_method.trim()
    ? body.payment_method.trim().slice(0, 60)
    : 'Check';
  const memo = typeof body.memo === 'string' ? body.memo.slice(0, 4000) : null;
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return NextResponse.json({ error: 'idempotency_key is required (8-128 chars, [A-Za-z0-9_-])' }, { status: 400 });
  }
  // Namespace by admin so the (source, external_id) unique constraint on
  // invoice_payments can double as the idempotency guard without one
  // admin's key colliding with another's.
  const externalId = `sales_receipt:${admin.email ?? admin.adminId}:${idempotencyKey}`;

  try {
    await ensureSchema();

    const result = await withNeonTransaction(async (client) => {
      // Idempotent replay: if this exact key already produced a payment,
      // return the existing receipt instead of creating a second one.
      const existing = await client.query<{ invoice_id: string }>(
        `SELECT invoice_id FROM invoice_payments WHERE source = 'sales_receipt' AND external_id = $1`,
        [externalId],
      );
      if (existing.rows[0]) {
        const invoiceRows = await client.query('SELECT * FROM invoices WHERE id = $1', [existing.rows[0].invoice_id]);
        return { invoice: invoiceRows.rows[0], replayed: true };
      }

      const advRows = await client.query<{
        name: string; contact_email: string | null; billing_email: string | null;
        address: string | null; address_2: string | null; city: string | null; state: string | null; zip: string | null;
      }>(
        `SELECT name, contact_email, billing_email, address, address_2, city, state, zip FROM advertisers WHERE id = $1`,
        [advertiserId],
      );
      const adv = advRows.rows[0];
      if (!adv) throw Object.assign(new Error('partner not found'), { status: 400 });

      const year = new Date().getFullYear();
      const series = `sales_receipt:${year}`;
      await client.query(
        `INSERT INTO document_number_counters (series, next_value)
         SELECT $1,
                COALESCE(MAX(substring(number from '([0-9]+)$')::integer), 0) + 1
           FROM invoices
          WHERE number LIKE $2
         ON CONFLICT (series) DO NOTHING`,
        [series, `SR-${year}-%`],
      );
      const sequence = await nextDocumentNumber(client, series);
      const number = `SR-${year}-${String(sequence).padStart(4, '0')}`;

      const billToName = typeof body.bill_to_name === 'string' ? body.bill_to_name : adv.name;
      const billToEmail = typeof body.bill_to_email === 'string' ? body.bill_to_email : (adv.billing_email ?? adv.contact_email);
      const billToAddress = typeof body.bill_to_address === 'string'
        ? body.bill_to_address
        : ([adv.address, adv.address_2, adv.city, adv.state, adv.zip].filter(Boolean).join(', ') || null);

      const invoiceRows = await client.query(
        `INSERT INTO invoices (
           advertiser_id, number, amount_cents, tax_cents, status,
           issued_at, due_date, bill_to_name, bill_to_email, bill_to_address,
           memo, line_items, created_by
         ) VALUES (
           $1, $2, $3, 0, 'sent',
           $4, $4, $5, $6, $7, $8, $9::jsonb, $10
         )
         RETURNING *`,
        [
          advertiserId, number, amountCents,
          `${receiptDate}T12:00:00.000Z`, billToName, billToEmail, billToAddress,
          memo, JSON.stringify(lineItems), admin.email ?? null,
        ],
      );
      const invoice = invoiceRows.rows[0];

      await client.query(
        `INSERT INTO invoice_payments (
           invoice_id, amount_cents, payment_date, payment_method,
           reference, memo, source, external_id, created_by
         ) VALUES ($1, $2, $3, $4, NULL, $5, 'sales_receipt', $6, $7)`,
        [invoice.id, amountCents, receiptDate, paymentMethod, `Payment recorded with sales receipt ${number}`, externalId, admin.email ?? null],
      );

      await recalculateInvoiceFromLedger(client, invoice.id, { paidAtDate: receiptDate });
      const finalRows = await client.query('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
      return { invoice: finalRows.rows[0], replayed: false };
    });

    revalidateInvoiceViews(result.invoice?.id as string | undefined);
    return NextResponse.json({ invoice: result.invoice, replayed: result.replayed }, { status: result.replayed ? 200 : 201 });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 400) {
      return NextResponse.json({ error: errMessage(err) }, { status: 400 });
    }
    console.error('[admin/sales-receipts POST]', errMessage(err));
    captureServerEvent('sales_receipt_create_failed', admin?.email ?? 'server', { detail: errMessage(err) });
    await flushServerEvents();
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
});
