import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}

async function invoiceId(request: NextRequest, context: RouteCtx) {
  const params = await context.params;
  const routeId = params?.id || '';
  return UUID_RE.test(routeId) ? routeId : (request.nextUrl.pathname.split('/')[4] || '');
}

export async function GET(request: NextRequest, context: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = await invoiceId(request, context);
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const payments = await sql`
      SELECT * FROM invoice_payments
      WHERE invoice_id = ${id}
      ORDER BY payment_date, created_at
    `;
    return NextResponse.json({ payments });
  } catch (error) {
    return NextResponse.json({ error: 'list failed', detail: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = await invoiceId(request, context);
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const amountCents = Number(body.amount_cents);
  const paymentDate = typeof body.payment_date === 'string' ? body.payment_date : '';
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: 'amount_cents must be a positive integer' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return NextResponse.json({ error: 'payment_date must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const invoices = await sql`SELECT id, total_cents, status FROM invoices WHERE id = ${id}`;
    if (invoices.length === 0) return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
    if (invoices[0].status === 'void') return NextResponse.json({ error: 'cannot pay a void invoice' }, { status: 400 });

    const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'manual';
    const externalId = typeof body.external_id === 'string' && body.external_id.trim() ? body.external_id.trim() : null;
    const rows = await sql`
      INSERT INTO invoice_payments (
        invoice_id, amount_cents, payment_date, payment_method,
        reference, memo, source, external_id, created_by
      ) VALUES (
        ${id}, ${amountCents}, ${paymentDate},
        ${typeof body.payment_method === 'string' ? body.payment_method : null},
        ${typeof body.reference === 'string' ? body.reference : null},
        ${typeof body.memo === 'string' ? body.memo : null},
        ${source}, ${externalId}, ${admin.email ?? null}
      )
      ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET
        invoice_id = EXCLUDED.invoice_id,
        amount_cents = EXCLUDED.amount_cents,
        payment_date = EXCLUDED.payment_date,
        payment_method = EXCLUDED.payment_method,
        reference = EXCLUDED.reference,
        memo = EXCLUDED.memo,
        updated_at = now()
      RETURNING *
    `;

    const totals = await sql`
      SELECT COALESCE(sum(amount_cents), 0)::int AS amount_paid_cents
      FROM invoice_payments WHERE invoice_id = ${id}
    `;
    const totalCents = Number(invoices[0].total_cents);
    const amountPaidCents = Number(totals[0].amount_paid_cents);
    const fullyPaid = amountPaidCents >= totalCents;
    await sql`
      UPDATE invoices
      SET status = CASE WHEN ${fullyPaid} THEN 'paid' ELSE CASE WHEN due_date < CURRENT_DATE THEN 'overdue' ELSE 'sent' END END,
          paid_at = CASE WHEN ${fullyPaid} THEN ${`${paymentDate}T12:00:00.000Z`}::timestamptz ELSE NULL END
      WHERE id = ${id}
    `;

    revalidateInvoiceViews(id);
    return NextResponse.json({
      payment: rows[0],
      amount_paid_cents: amountPaidCents,
      balance_cents: Math.max(totalCents - amountPaidCents, 0),
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'record failed', detail: errorMessage(error) }, { status: 500 });
  }
}
