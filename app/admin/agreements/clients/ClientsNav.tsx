'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ClientsNav() {
  const path = usePathname() ?? '';
  const onContacts = path.endsWith('/contacts');
  const onDetail = !onContacts && /\/clients\/[^/]+$/.test(path);
  if (onDetail) return null;
  const tab = (href: string, label: string, active: boolean) => (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-3 pt-2 text-[15px] ${active ? 'border-[color:var(--ds-primary)] font-medium text-[color:var(--ds-ink)]' : 'border-transparent text-[color:var(--ds-body)] hover:text-[color:var(--ds-ink)]'}`}>{label}</Link>
  );
  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ds-ink)]">Clients <span className="ml-1 rounded-full border border-[color:var(--ds-primary)] px-2 py-0.5 align-middle text-xs font-medium text-[color:var(--ds-primary)]">Beta</span></h1>
      <p className="text-sm text-[color:var(--ds-body)]">Every client appears here once their proposal is approved.</p>
      <nav aria-label="Clients" className="mt-4 flex gap-2 border-b border-[color:var(--ds-line)]">
        {tab('/admin/agreements/clients', 'Clients', !onContacts)}
        {tab('/admin/agreements/clients/contacts', 'Contacts', onContacts)}
      </nav>
    </div>
  );
}
