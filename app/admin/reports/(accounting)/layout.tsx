import Link from 'next/link';
import GetPaidNav from '@/app/admin/getpaid/_components/GetPaidNav';

const REPORT_LINKS = [
  ['Deposits', '/admin/reports/deposits'],
  ['Detail', '/admin/reports/detail'],
] as const;

export default function AccountingReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <GetPaidNav />
      <div className="no-print border-b border-gray-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-6 py-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Reports</span>
          {REPORT_LINKS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
