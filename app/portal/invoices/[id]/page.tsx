// app/portal/invoices/[id]/page.tsx
//
// Advertiser-facing invoice detail + pay page. Reached via a `pay_invoice`
// magic link (see app/portal/consume/route.ts) or by navigating from
// /portal/orders. Requires an active portal session for the invoice's
// own advertiser.

import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { canPayPartial } from '@/lib/server/partial-payments';
import InvoicePayClient from './InvoicePayClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  memo: string | null;
  line_items: Array<{ description: string; qty: number; unit_cents: number }>;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  advertiser_id: number | null;
}

interface BalanceRow {
  total_cents: number;
  issued_at: string | Date;
}

/** Neon returns timestamp columns as Date objects; the client expects strings. */
function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

/** Line items come in two shapes: {qty, unit_cents} (app) and
 *  {quantity, rate_cents, amount_cents} (imported/legacy). Normalize both. */
function normalizeLineItems(raw: unknown): InvoiceRow['line_items'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((li) => {
    const item = (li ?? {}) as Record<string, unknown>;
    const qty = Number(item.qty ?? item.quantity ?? 1) || 1;
    const amount = Number(item.amount_cents ?? 0);
    const unit = Number(item.unit_cents ?? item.rate_cents ?? (amount ? Math.round(amount / qty) : 0)) || 0;
    return { description: String(item.description ?? ''), qty, unit_cents: unit };
  });
}

function normalizeInvoice(row: InvoiceRow): InvoiceRow {
  return {
    ...row,
    issued_at: toIso(row.issued_at),
    due_date: toIso(row.due_date),
    paid_at: toIso(row.paid_at),
    line_items: normalizeLineItems(row.line_items),
  };
}

export default async function InvoicePayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) redirect('/portal/error?code=session');

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, number, status, amount_cents, tax_cents, total_cents,
           issued_at, due_date, paid_at, memo, line_items,
           bill_to_name, bill_to_email, bill_to_address, advertiser_id
    FROM invoices WHERE id = ${id}
  `) as unknown as InvoiceRow[];

  if (rows.length === 0) redirect('/portal?notfound=invoice');
  const invoice = normalizeInvoice(rows[0]);
  if (invoice.advertiser_id !== portalUser!.advertiser_id) {
    redirect('/portal/error?code=forbidden');
  }

  let balanceRows: BalanceRow[] = [];
  if (invoice.advertiser_id && invoice.issued_at) {
    balanceRows = (await sql`
        SELECT total_cents, issued_at
        FROM invoices
        WHERE advertiser_id = ${invoice.advertiser_id}
          AND id <> ${invoice.id}
          AND status NOT IN ('paid', 'void')
          AND issued_at IS NOT NULL
      `) as unknown as BalanceRow[];
  }
  const invoiceIssuedAt = invoice.issued_at ? new Date(invoice.issued_at).getTime() : null;
  const balanceForwardCents = balanceRows.reduce((sum, row) => {
    const rowIssuedAt = new Date(row.issued_at).getTime();
    return invoiceIssuedAt !== null && rowIssuedAt < invoiceIssuedAt ? sum + Number(row.total_cents) : sum;
  }, 0);
  const paymentsCreditsCents = invoice.status === 'paid' ? invoice.total_cents : 0;
  const totalAmountDueCents = balanceForwardCents + invoice.total_cents - paymentsCreditsCents;

  const allowPartial = await canPayPartial(invoice.advertiser_id);
  let remainingCents = Math.max(0, invoice.total_cents - paymentsCreditsCents);
  if (allowPartial && invoice.status !== 'paid') {
    const paid = (await sql`SELECT COALESCE(sum(amount_cents), 0)::int AS c FROM invoice_payments WHERE invoice_id = ${invoice.id}`) as unknown as Array<{ c: number }>;
    remainingCents = Math.max(0, invoice.total_cents - Number(paid[0]?.c ?? 0));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <InvoicePayClient
        invoice={invoice}
        accountSummary={{
          balanceForwardCents,
          paymentsCreditsCents,
          newChargesCents: invoice.total_cents,
          totalAmountDueCents,
        }}
        allowPartial={allowPartial}
        remainingCents={remainingCents}
        justPaid={sp.paid === '1'}
        justCanceled={sp.canceled === '1'}
      />
    </div>
  );
}
