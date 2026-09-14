// app/admin/getpaid/statements/[advertiserId]/page.tsx
//
// Statement of Account for one partner — mirrors the invoice document
// design (app/admin/invoices/[id]/preview/page.tsx): same letterhead,
// same neutral/print styling, same PrintInvoiceButton. Lists every
// outstanding invoice with its payment link, cross-referencing whatever
// is already stored on the invoice from /admin/getpaid/paymentlinks.

import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PrintInvoiceButton from '../../../invoices/[id]/preview/PrintInvoiceButton';
import GenerateLinkButton from './GenerateLinkButton';
import StatementEmailButton from '../StatementEmailButton';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type StatementInvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  total_cents: number;
  issued_at: string | Date | null;
  due_date: string | Date | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  stripe_payment_link_url: string | null;
  amount_paid_cents: number;
  balance_cents: number;
  is_overdue: boolean;
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function date(value: string | Date | null) {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function StatementPage({
  params,
}: {
  params: Promise<{ advertiserId: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  const { advertiserId } = await params;
  const advertiserIdNum = Number(advertiserId);
  if (!Number.isInteger(advertiserIdNum)) notFound();

  await ensureSchema();
  const sql = getSql();

  const advertiserRows = (await sql`
    SELECT id, name, billing_email, contact_email, portal_email
    FROM advertisers WHERE id = ${advertiserIdNum}
  `) as unknown as Array<{
    id: number;
    name: string;
    billing_email: string | null;
    contact_email: string | null;
    portal_email: string | null;
  }>;
  const advertiser = advertiserRows[0];
  if (!advertiser) notFound();

  const invoices = (await sql`
    SELECT i.id, i.number, i.status, i.total_cents, i.issued_at, i.due_date,
      i.bill_to_name, i.bill_to_email, i.bill_to_address, i.stripe_payment_link_url,
      COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
      GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
      (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
    FROM invoices i
    LEFT JOIN LATERAL (
      SELECT SUM(p.amount_cents)::int AS amount_paid_cents
      FROM invoice_payments p WHERE p.invoice_id = i.id
    ) pay ON true
    WHERE i.advertiser_id = ${advertiserIdNum}
      AND i.status NOT IN ('paid', 'void', 'draft')
      AND GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0) > 0
    ORDER BY i.issued_at ASC NULLS LAST
  `) as unknown as StatementInvoiceRow[];

  if (invoices.length === 0) notFound();

  const billTo = invoices[invoices.length - 1];
  const recipient =
    advertiser.billing_email?.trim() ||
    billTo.bill_to_email?.trim() ||
    advertiser.contact_email?.trim() ||
    advertiser.portal_email?.trim() ||
    '';
  const overdueCents = invoices.filter((i) => i.is_overdue).reduce((sum, i) => sum + i.balance_cents, 0);
  const notYetDueCents = invoices.filter((i) => !i.is_overdue).reduce((sum, i) => sum + i.balance_cents, 0);
  const outstandingCents = overdueCents + notYetDueCents;
  const asOf = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Statement of account</h1>
          <p className="text-sm text-gray-500">{advertiser.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatementEmailButton
            advertiserId={advertiser.id}
            advertiserName={advertiser.name}
            recipient={recipient}
          />
          <PrintInvoiceButton />
        </div>
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
            <div className="text-2xl tracking-wide text-neutral-900">STATEMENT</div>
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
            <div className="font-semibold">{billTo.bill_to_name ?? advertiser.name}</div>
            {billTo.bill_to_address && <div className="mt-1 whitespace-pre-line">{billTo.bill_to_address}</div>}
            {billTo.bill_to_email && <div>{billTo.bill_to_email}</div>}
          </div>
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 text-right">
            <dt className="font-semibold">Currency:</dt><dd>United States dollar (USD)</dd>
            <dt className="font-semibold">Statement date:</dt><dd>As of {asOf}</dd>
          </dl>
        </section>

        <section className="mb-5">
          <div className="border-b border-neutral-300 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            Outstanding invoices
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-neutral-200 py-1.5">
            <div>Overdue</div>
            <div className="text-right">{money(overdueCents)}</div>
            <div>Not yet due</div>
            <div className="text-right">{money(notYetDueCents)}</div>
            <div className="bg-neutral-100 px-2 py-2 font-semibold">Outstanding balance (USD)</div>
            <div className="bg-neutral-100 px-2 py-2 text-right font-semibold">{money(outstandingCents)}</div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-[110px_100px_100px_85px_85px_90px] bg-neutral-900 px-3 py-2 font-semibold text-white">
            <div>Invoice #</div>
            <div>Invoice date</div>
            <div>Due date</div>
            <div className="text-right">Total</div>
            <div className="text-right">Paid</div>
            <div className="text-right">Due</div>
          </div>
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="grid grid-cols-[110px_100px_100px_85px_85px_90px] border-b border-neutral-200 px-3 py-3"
            >
              <div>
                {invoice.stripe_payment_link_url ? (
                  <a
                    href={invoice.stripe_payment_link_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-700 underline print:text-neutral-900 print:no-underline"
                  >
                    {invoice.number ?? invoice.id.slice(0, 8)}
                  </a>
                ) : (
                  <div>
                    <Link
                      href={`/admin/invoices/${invoice.id}/preview`}
                      className="font-semibold text-blue-700 underline print:text-neutral-900 print:no-underline"
                    >
                      {invoice.number ?? invoice.id.slice(0, 8)}
                    </Link>
                    <GenerateLinkButton invoiceId={invoice.id} />
                  </div>
                )}
              </div>
              <div>{date(invoice.issued_at)}</div>
              <div>
                {date(invoice.due_date)}
                {invoice.is_overdue && <div className="text-[9px] font-semibold text-red-600">Overdue</div>}
              </div>
              <div className="text-right">{money(invoice.total_cents)}</div>
              <div className="text-right">{money(invoice.amount_paid_cents)}</div>
              <div className="text-right font-semibold">{money(invoice.balance_cents)}</div>
            </div>
          ))}
        </section>

        <section className="mt-3 ml-auto w-64">
          <div className="flex justify-between bg-neutral-100 px-2 py-2 font-semibold">
            <span>Outstanding balance (USD):</span>
            <span>{money(outstandingCents)}</span>
          </div>
        </section>

        <footer className="mt-8 text-center text-[9px] text-neutral-500">We appreciate your business.</footer>
      </article>
    </div>
  );
}
