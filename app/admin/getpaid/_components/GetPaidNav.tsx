import Link from 'next/link';

const GET_PAID_LINKS = [
  ['Accounts receivable', '/admin/getpaid/accountsreceivables'],
  ['Sales transactions', '/admin/getpaid/salestransactions'],
  ['Invoices', '/admin/getpaid/invoices'],
  ['Payment links', '/admin/getpaid/paymentlinks'],
  ['Recurring payments', '/admin/getpaid/reoccuringpayments'],
  ['Stripe payouts', '/admin/getpaid/stripepayouts'],
  ['Products & Services', '/admin/getpaid/product&services'],
] as const;

export default function GetPaidNav() {
  return (
    <div className="no-print border-b border-gray-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 py-2">
        {GET_PAID_LINKS.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
