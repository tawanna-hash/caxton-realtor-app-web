// app/portal/invoices/[id]/page.tsx
//
// Advertiser-facing invoice detail + pay page. Reached via a `pay_invoice`
// magic link (see app/portal/consume/route.ts) or by navigating from
// /portal/orders. Requires an active portal session for the invoice's
// own advertiser.

import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import PageTitle from '@/components/ui/PageTitle';
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
  const invoice = rows[0];
  if (invoice.advertiser_id !== portalUser!.advertiser_id) {
    redirect('/portal/error?code=forbidden');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageTitle>Invoice {invoice.number}</PageTitle>
      <p className="mt-1 mb-8 text-sm text-gray-500">RealtyLine advertising invoice</p>
      <InvoicePayClient
        invoice={invoice}
        justPaid={sp.paid === '1'}
        justCanceled={sp.canceled === '1'}
      />
    </div>
  );
}
