'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: Array<[string, string]> = [['/admin/services-beta', 'Services'], ['/admin/services-beta/bundles', 'Bundles']];

export default function ServicesNav() {
  const path = usePathname() ?? '';
  return (
    <div role="tablist" aria-label="Services" className="flex gap-x-8 border-b border-[color:var(--ds-line)]">
      {TABS.map(([href, label]) => {
        const on = href === '/admin/services-beta' ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} role="tab" aria-selected={on} className={`-mb-px pb-3 text-[15px] ${on ? 'font-medium text-[color:var(--ds-ink)]' : 'text-[color:var(--ds-body)]'}`} style={{ borderBottom: '3px solid transparent' }}>{label}</Link>
        );
      })}
    </div>
  );
}
