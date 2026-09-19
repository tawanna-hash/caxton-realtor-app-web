import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { isIsoCalendarDate } from '@/lib/invoices';
import { withNeonTransaction } from '@/lib/server/db/neon';
import {
  invalidateInvoiceCheckoutSessions,
  recalculateInvoiceFromLedger,
} from '@/lib/server/invoice-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/invoice-payments/[id]
 *
 * Corrects the descriptive fields of an already recorded payment: payment
 * type, reference (check no.) and memo. Amount and invoice linkage are
 * intentionally immutable here — changing those would move an invoice
 * balance, which stays owned by the record/void payment workflows.
 */
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid payment id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const text = (value: unknown): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const paymentMethod = text(body.payment_method);
  const reference = text(body.reference);
  const memo = text(body.memo);
  const paymentDate = text(body.payment_date);

  if (paymentMethod === undefined && reference === undefined && memo === undefined && paymentDate === undefined) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  if (paymentMethod !== undefined && paymentMethod !== null && paymentMethod.length > 80) {
    return NextResponse.json({ error: 'payment_method is too long' }, { status: 400 });
  }
  if (paymentDate !== undefined && (paymentDate === null || !isIsoCalendarDate(paymentDate))) {
    return NextResponse.json({ error: 'payment_date must be a real YYYY-MM-DD date' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const existing = (await sql`
      SELECT id, invoice_id, payment_method, reference, memo, payment_date
        FROM invoice_payments
       WHERE id = ${id}
       LIMIT 1
    `) as { id: string; invoice_id: string; payment_method: string | null; reference: string | null; memo: string | null; payment_date: string }[];
    if (!existing.length) {
      return NextResponse.json({ error: 'payment not found' }, { status: 404 });
    }

    // Resolve final values here rather than branching in SQL, so every
    // parameter has an unambiguous type for Postgres.
    const current = existing[0];
    const nextMethod = paymentMethod === undefined ? current.payment_method : paymentMethod;
    const nextReference = reference === undefined ? current.reference : reference;
    const nextMemo = memo === undefined ? current.memo : memo;
    const nextPaymentDate = paymentDate === undefined ? current.payment_date : paymentDate;

    const rows = (await sql`
      UPDATE invoice_payments
         SET payment_method = ${nextMethod},
             reference      = ${nextReference},
             memo           = ${nextMemo},
             payment_date   = ${nextPaymentDate},
             updated_at     = NOW()
       WHERE id = ${id}
       RETURNING id, invoice_id, amount_cents, payment_date, payment_method,
                 reference, memo, source, created_by, created_at, updated_at
    `) as Record<string, unknown>[];

    // Keep invoices.paid_at in sync with the most recent payment's date so
    // list/summary views reflect an edited payment_date immediately.
    if (paymentDate !== undefined) {
      await sql`
        UPDATE invoices
           SET paid_at = (
             SELECT (MAX(payment_date)::date + time '12:00') AT TIME ZONE 'UTC'
               FROM invoice_payments
              WHERE invoice_id = ${current.invoice_id}
           )
         WHERE id = ${current.invoice_id} AND paid_at IS NOT NULL
      `;
    }

    revalidateInvoiceViews(current.invoice_id);
    return NextResponse.json({ payment: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[invoice-payments:PATCH]', message);
    return NextResponse.json({ error: 'could not update payment' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/invoice-payments/[id]
 * Payment amounts are financial history, so deletion is deliberately not the
 * default correction path. Clients must send a typed payment id acknowledgement.
 */
export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid payment id' }, { status: 400 });
  let body: { permanent?: unknown; confirmation_id?: unknown } = {};
  try { body = await request.json(); } catch { /* Return the confirmation error below. */ }
  if (body.permanent !== true || body.confirmation_id !== id) {
    return NextResponse.json({
      error: 'payment history is permanent by default. Send permanent: true and confirmation_id equal to the payment id to delete it.',
      action: 'confirm_permanent_delete',
    }, { status: 409 });
  }
  try {
    await ensureSchema();
    const invoiceId = await withNeonTransaction(async (client) => {
      const rows = await client.query<{ invoice_id: string }>(
        'DELETE FROM invoice_payments WHERE id = $1 RETURNING invoice_id',
        [id],
      );
      const deleted = rows.rows[0];
      if (!deleted) return null;
      await recalculateInvoiceFromLedger(client, deleted.invoice_id);
      await invalidateInvoiceCheckoutSessions(client, deleted.invoice_id);
      return deleted.invoice_id;
    });
    if (!invoiceId) return NextResponse.json({ error: 'payment not found' }, { status: 404 });
    revalidateInvoiceViews(invoiceId);
    return NextResponse.json({ ok: true, invoice_id: invoiceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[invoice-payments:DELETE]', message);
    return NextResponse.json({ error: 'could not permanently delete payment' }, { status: 500 });
  }
}
