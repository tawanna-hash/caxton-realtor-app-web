'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const GET_PAID_LINKS = [
  { label: 'Dashboard', href: '/admin/get-paid', exact: true },
  { label: 'Agreements', href: '/admin/agreements/renewals-v2' },
  { label: 'Partners', href: '/admin/agreements/clients' },
  { label: 'Billing', href: '/admin/billing-hub' },
  { label: 'Invoices', href: '/admin/billing-hub/invoices' },
  { label: 'Payouts', href: '/admin/payouts-beta' },
  { label: 'Services', href: '/admin/services-beta' },
  { label: 'Reports', href: '/admin/reports-beta' },
  { label: 'Settings', href: '/admin/get-paid/settings' },
] as const;

export default function GetPaidNav() {
  const path = usePathname() ?? '';
  return (
    <nav className="flex flex-wrap gap-1 border-b border-[color:var(--ds-line)]" aria-label="Get Paid">
      {GET_PAID_LINKS.map((l) => {
        const active = 'exact' in l ? path === l.href : path.startsWith(l.href) || (l.label === 'Settings' && path.startsWith('/admin/get-paid/'));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? 'border-[color:var(--ds-primary)] font-medium text-[color:var(--ds-primary)]' : 'border-transparent text-[color:var(--ds-body)] hover:text-[color:var(--ds-ink)]'}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
