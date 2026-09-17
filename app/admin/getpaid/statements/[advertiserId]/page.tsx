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
import {
  getOrCreatePartnerStatementOverdueLink,
  type PartnerStatement,
} from '@/lib/server/partner-statement';
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

type StatementHistoryRow = {
  id: string;
  recipient_email: string;
  sender_email: string;
  subject: string;
  sent_by: string | null;
  sent_at: string | Date;
  invoice_count: number;
  outstanding_cents: number;
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

  const sendHistory = (await sql`
    SELECT id, recipient_email, sender_email, subject, sent_by, sent_at,
      invoice_count, outstanding_cents
    FROM statement_send_history
    WHERE advertiser_id = ${advertiserIdNum}
    ORDER BY sent_at DESC
  `) as unknown as StatementHistoryRow[];

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
  let overduePaymentLinkUrl: string | null = null;
  if (overdueCents > 0) {
    const statement: PartnerStatement = {
      advertiserId: advertiser.id,
      advertiserName: advertiser.name,
      recipientEmail: recipient || null,
      billToName: billTo.bill_to_name?.trim() || advertiser.name,
      billToEmail: billTo.bill_to_email?.trim() || null,
      billToAddress: billTo.bill_to_address?.trim() || null,
      asOf: new Date(),
      overdueCents,
      notYetDueCents,
      outstandingCents,
      overduePaymentLinkUrl: null,
      invoices: invoices.map((invoice) => ({
        ...invoice,
        stripe_checkout_session_id: null,
      })),
    };
    try {
      const linked = await getOrCreatePartnerStatementOverdueLink(statement);
      overduePaymentLinkUrl = linked.overduePaymentLinkUrl;
    } catch (error) {
      console.error('[statement] could not create combined overdue payment link', error);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Statement of Account</h1>
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

      <section className="mb-5 overflow-hidden rounded border border-gray-200 bg-white print:hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Statement Send History</h2>
            <p className="text-xs text-gray-500">
              {sendHistory.length
                ? `${sendHistory.length.toLocaleString()} successful ${sendHistory.length === 1 ? 'delivery' : 'deliveries'}`
                : 'No statements have been sent yet.'}
            </p>
          </div>
          {sendHistory[0] && (
            <div className="text-right text-xs text-gray-500">
              Last sent
              <div className="font-medium text-gray-900">
                {new Date(sendHistory[0].sent_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: 'America/Chicago',
                  timeZoneName: 'short',
                })}
              </div>
            </div>
          )}
        </div>
        {sendHistory.length > 0 && (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Recipient</th>
                  <th className="px-3 py-2 font-semibold">From</th>
                  <th className="px-3 py-2 text-right font-semibold">Invoices</th>
                  <th className="px-4 py-2 text-right font-semibold">Balance sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sendHistory.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">
                      {new Date(event.sent_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'America/Chicago',
                      })}
                      {event.sent_by && <div className="text-[11px] text-gray-400">by {event.sent_by}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700" title={event.subject}>{event.recipient_email}</td>
                    <td className="px-3 py-2.5 text-gray-600">{event.sender_email}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{event.invoice_count}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">{money(event.outstanding_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
            <div className="mt-2">www.realtynewsnow.app</div>
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

        {overduePaymentLinkUrl && (
          <section className="mb-5 border border-orange-200 bg-orange-50 px-4 py-4 text-center">
            <div className="font-semibold text-orange-900">
              Pay all overdue invoices: {money(overdueCents)}
            </div>
            <a
              href={overduePaymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex rounded bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 print:text-black"
            >
              Pay all overdue invoices
            </a>
          </section>
        )}

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
