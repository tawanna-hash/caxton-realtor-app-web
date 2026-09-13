import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  InvoicePaymentError,
  recordInvoicePayment,
} from '@/lib/server/invoice-payments';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
  const amountCents = Number(body.amount_cents);
  const paymentDate = typeof body.payment_date === 'string' ? body.payment_date : '';
  if (!UUID_RE.test(invoiceId)) {
    return NextResponse.json({ error: 'invalid invoice_id' }, { status: 400 });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: 'amount_cents must be a positive integer' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return NextResponse.json({ error: 'payment_date must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'manual';
    const externalId = typeof body.external_id === 'string' && body.external_id.trim() ? body.external_id.trim() : null;
    const result = await recordInvoicePayment({
      invoiceId,
      amountCents,
      paymentDate,
      paymentMethod: typeof body.payment_method === 'string' ? body.payment_method : null,
      reference: typeof body.reference === 'string' ? body.reference : null,
      memo: typeof body.memo === 'string' ? body.memo : null,
      source,
      externalId,
      createdBy: admin.email ?? null,
    });

    revalidateInvoiceViews(invoiceId);
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
