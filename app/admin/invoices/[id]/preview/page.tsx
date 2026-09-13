import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PrintInvoiceButton from './PrintInvoiceButton';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type LineItem = { description: string; qty: number; unit_cents: number };
type InvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  memo: string | null;
  line_items: LineItem[];
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  advertiser_name: string | null;
  advertiser_id: number | null;
};
type BalanceRow = { balance_forward_cents: number | string };

const TERMS = [
  ['FREQUENCY DISCOUNT', 'An advertiser who does not complete a committed consecutive-month insertion schedule will be subject to the one-time insertion rate.'],
  ['AGENCY', 'All advertisements are published for the benefit of advertiser and advertising agency, and each of them is jointly and severally liable for all charges.'],
  ['BILLING', 'Payment in U.S. dollars, including any applicable tax, is due at Publisher’s Postal Box in Austin, Texas, within 20 days after the invoice date. Any error in billing is binding upon advertiser and/or advertising agency unless Publisher receives written notice of the error within such 20-day period.'],
  ['PAST DUE', 'All accounts not paid in full within 20 days of the date of the invoice shall incur a late charge of 1.5% per month from the due date until paid in full.'],
  ['COLLECTION', 'If advertiser and/or advertising agency defaults in payment of invoices, such invoices are turned over for collection. Advertiser and/or advertising agency shall be totally liable for all fees and sums charged by the collection agency or attorney, including attorneys’ fees and court costs incurred by Publisher.'],
] as const;

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function date(value: string | null) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  const { id } = await params;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT i.*, a.name AS advertiser_name
    FROM invoices i
    LEFT JOIN advertisers a ON a.id = i.advertiser_id
    WHERE i.id = ${id}
  `) as unknown as InvoiceRow[];
  const invoice = rows[0];
  if (!invoice) notFound();

  const paid = invoice.status === 'paid';
  let balanceRows: BalanceRow[] = [];
  if (invoice.advertiser_id && invoice.issued_at) {
    balanceRows = (await sql`
        SELECT COALESCE(SUM(total_cents), 0)::bigint AS balance_forward_cents
        FROM invoices
        WHERE advertiser_id = ${invoice.advertiser_id}
          AND id <> ${invoice.id}
          AND status NOT IN ('paid', 'void')
          AND issued_at IS NOT NULL
          AND issued_at < ${invoice.issued_at}
      `) as unknown as BalanceRow[];
  }
  const balanceForwardCents = Number(balanceRows[0]?.balance_forward_cents ?? 0);
  const paymentsCreditsCents = paid ? invoice.total_cents : 0;
  const accountTotalDueCents = balanceForwardCents + invoice.total_cents - paymentsCreditsCents;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Invoice preview</h1>
          <p className="text-sm text-gray-500">{invoice.number ?? 'Draft invoice'}</p>
        </div>
        <PrintInvoiceButton />
      </div>

      <article className="bg-white px-6 py-8 text-[11px] leading-[1.35] text-neutral-800 shadow-sm ring-1 ring-gray-200 print:px-0 print:py-0 print:shadow-none print:ring-0 sm:px-10">
        <header className="grid grid-cols-[1fr_auto] gap-8 border-b border-neutral-300 pb-5">
          <Image
            src="/brand/caxton-logo.jpg"
            alt="Caxton Publications Inc."
            width={160}
            height={180}
            className="h-auto w-28 object-contain"
            priority
          />
          <div className="text-right">
            <div className="text-2xl tracking-wide text-neutral-900">INVOICE</div>
            <div className="mt-1 font-semibold">Caxton Publications, Inc.</div>
            <div>PO Box 81366</div>
            <div>Austin, Texas 78708-1366</div>
            <div>United States</div>
            <div className="mt-2">www.myrealtyline.com</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-8 py-5">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">Bill to</div>
            <div className="font-semibold">{invoice.bill_to_name ?? invoice.advertiser_name ?? 'Customer'}</div>
            {invoice.bill_to_address && <div className="mt-1 whitespace-pre-line">{invoice.bill_to_address}</div>}
            {invoice.bill_to_email && <div>{invoice.bill_to_email}</div>}
          </div>
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 text-right">
            <dt className="font-semibold">Invoice Number:</dt><dd>{invoice.number ?? 'Draft'}</dd>
            <dt className="font-semibold">Invoice Date:</dt><dd>{date(invoice.issued_at)}</dd>
            <dt className="font-semibold">Payment Due:</dt><dd>{date(invoice.due_date)}</dd>
            <dt className="mt-2 bg-neutral-100 px-2 py-2 font-semibold">Amount Due (USD):</dt>
            <dd className="mt-2 bg-neutral-100 px-2 py-2 font-semibold">{paid ? '$0.00' : money(invoice.total_cents)}</dd>
          </dl>
        </section>

        <section className="mb-5">
          <div className="border-b border-neutral-300 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Account summary</div>
          <div className="grid grid-cols-[90px_1fr_auto] gap-x-3 border-b border-neutral-200 py-1.5">
            <div>{date(invoice.issued_at)}</div>
            <div>Balance Forward</div>
            <div className="text-right">{money(balanceForwardCents)}</div>
            <div />
            <div>Payments and credits</div>
            <div className="text-right">{paymentsCreditsCents > 0 ? `-${money(paymentsCreditsCents)}` : money(0)}</div>
            <div />
            <div>New charges</div>
            <div className="text-right">{money(invoice.total_cents)}</div>
            <div />
            <div className="font-semibold">Total Amount Due</div>
            <div className="text-right font-semibold">{money(accountTotalDueCents)}</div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-[1fr_70px_85px_90px] bg-neutral-900 px-3 py-2 font-semibold text-white">
            <div>Services</div><div className="text-center">Quantity</div><div className="text-right">Rate</div><div className="text-right">Amount</div>
          </div>
          {invoice.line_items?.length ? invoice.line_items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_70px_85px_90px] border-b border-neutral-200 px-3 py-3">
              <div>{item.description}</div>
              <div className="text-center">{item.qty}</div>
              <div className="text-right">{money(item.unit_cents)}</div>
              <div className="text-right">{money(item.unit_cents * item.qty)}</div>
            </div>
          )) : (
            <div className="border-b border-neutral-200 px-3 py-4 text-center italic text-neutral-500">No itemized services.</div>
          )}
        </section>

        <section className="ml-auto mt-3 w-64">
          <div className="flex justify-between border-b border-neutral-200 py-1"><span>Total:</span><span>{money(invoice.amount_cents)}</span></div>
          {invoice.tax_cents > 0 && <div className="flex justify-between border-b border-neutral-200 py-1"><span>Tax:</span><span>{money(invoice.tax_cents)}</span></div>}
          <div className="flex justify-between py-2 font-semibold"><span>Amount Due (USD):</span><span>{paid ? '$0.00' : money(invoice.total_cents)}</span></div>
        </section>

        {invoice.memo && (
          <section className="mt-3 border-t border-neutral-200 pt-3">
            <div className="font-semibold">Notes</div>
            <div className="mt-1 whitespace-pre-line">{invoice.memo}</div>
          </section>
        )}

        <section className="mt-5 border-t border-neutral-300 pt-4">
          <h2 className="mb-3 font-semibold">Notes / Terms</h2>
          <div className="space-y-3 text-[9px] leading-[1.45]">
            <p>CAXTON PUBLICATIONS INC<br />RealtyLine Austin and Newsline San Antonio are both publications under Caxton Publications, Inc. The Services line item specifies the publication name to indicate where your ad is being placed and billed. Placement in one publication does not automatically include placement in the other.</p>
            {TERMS.map(([title, body]) => (
              <div key={title}>
                <div className="font-semibold">{title}</div>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-8 text-center text-[9px] text-neutral-500">We appreciate your business.</footer>
      </article>
    </div>
  );
}
