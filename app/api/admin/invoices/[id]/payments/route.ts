import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  InvoicePaymentError,
  recordInvoicePayment,
} from '@/lib/server/invoice-payments';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  const routeId = await invoiceId(request, context);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const bodyId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
  const id = UUID_RE.test(routeId) ? routeId : bodyId;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

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
    // Admin-entered payments are always 'manual' (finding API-#8/UI-#18) —
    // see the sibling route for rationale.
    const result = await recordInvoicePayment({
      invoiceId: id,
      amountCents,
      paymentDate,
      paymentMethod: typeof body.payment_method === 'string' ? body.payment_method : null,
      reference: typeof body.reference === 'string' ? body.reference : null,
      memo: typeof body.memo === 'string' ? body.memo : null,
      source: 'manual',
      externalId: null,
      createdBy: admin.email ?? null,
    });

    revalidateInvoiceViews(id);
    return NextResponse.json({
      payment: result.payment,
      amount_paid_cents: result.amountPaidCents,
      balance_cents: result.balanceCents,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof InvoicePaymentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'record failed', detail: errorMessage(error) }, { status: 500 });
  }
}
