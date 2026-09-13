import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

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

  if (paymentMethod === undefined && reference === undefined && memo === undefined) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  if (paymentMethod !== undefined && paymentMethod !== null && paymentMethod.length > 80) {
    return NextResponse.json({ error: 'payment_method is too long' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const existing = (await sql`
      SELECT id, invoice_id, payment_method, reference, memo
        FROM invoice_payments
       WHERE id = ${id}
       LIMIT 1
    `) as { id: string; invoice_id: string; payment_method: string | null; reference: string | null; memo: string | null }[];
    if (!existing.length) {
      return NextResponse.json({ error: 'payment not found' }, { status: 404 });
    }

    // Resolve final values here rather than branching in SQL, so every
    // parameter has an unambiguous type for Postgres.
    const current = existing[0];
    const nextMethod = paymentMethod === undefined ? current.payment_method : paymentMethod;
    const nextReference = reference === undefined ? current.reference : reference;
    const nextMemo = memo === undefined ? current.memo : memo;

    const rows = (await sql`
      UPDATE invoice_payments
         SET payment_method = ${nextMethod},
             reference      = ${nextReference},
             memo           = ${nextMemo},
             updated_at     = NOW()
       WHERE id = ${id}
       RETURNING id, invoice_id, amount_cents, payment_date, payment_method,
                 reference, memo, source, created_by, created_at, updated_at
    `) as Record<string, unknown>[];

    revalidateInvoiceViews(current.invoice_id);
    return NextResponse.json({ payment: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[invoice-payments:PATCH]', message);
    return NextResponse.json({ error: 'could not update payment' }, { status: 500 });
  }
}
