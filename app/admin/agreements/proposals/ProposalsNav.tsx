'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: Array<[string, string]> = [
  ['sent', 'Sent'],
  ['drafts', 'Drafts'],
  ['archived', 'Archived'],
  ['templates', 'Templates'],
  ['defaults', 'Default settings'],
];

export default function ProposalsNav() {
  const path = usePathname() ?? '';
  return (
    <nav aria-label="Agreements" className="-mx-1 flex gap-2 overflow-x-auto border-b border-[color:var(--ds-line)] px-1">
      {LINKS.map(([slug, label]) => {
        const active = path.endsWith(`/proposals/${slug}`);
        return (
          <Link
            key={slug}
            href={`/admin/agreements/proposals/${slug}`}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-3 pt-2 text-[15px] ${active ? 'border-[color:var(--ds-primary)] font-medium text-[color:var(--ds-ink)]' : 'border-transparent text-[color:var(--ds-body)] hover:text-[color:var(--ds-ink)]'}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
