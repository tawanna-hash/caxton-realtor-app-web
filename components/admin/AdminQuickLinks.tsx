'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_NAV } from '@/lib/admin-nav';

type QuickLinkGroup = (typeof ADMIN_NAV)[number];
type QuickLink = QuickLinkGroup['links'][number];

function isLinkMatch(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function findQuickLinkContext(pathname: string): {
  group: QuickLinkGroup;
  activeLink: QuickLink;
} | null {
  const matches = ADMIN_NAV.flatMap((group) =>
    group.links
      .filter((link) => isLinkMatch(pathname, link.href))
      .map((link) => ({ group, activeLink: link })),
  );

  // Some pages share a route prefix, such as Client Reports and Deposit
  // Detail. The most specific route always determines the parent group.
  matches.sort((left, right) => right.activeLink.href.length - left.activeLink.href.length);
  return matches[0] ?? null;
}

function linksForContext(group: QuickLinkGroup, activeLink: QuickLink): QuickLink[] {
  // Content intentionally stays sectioned so the top row does not become an
  // unreadable set of seventeen destinations. Every other parent shows all
  // of its direct child pages in one Quick Links row.
  if (group.label === 'Content' && activeLink.section) {
    return group.links.filter((link) => link.section === activeLink.section);
  }

  return group.links;
}

export default function AdminQuickLinks() {
  const pathname = usePathname();
  const context = findQuickLinkContext(pathname);
  if (!context) return null;

  const { group, activeLink } = context;
  const links = linksForContext(group, activeLink);

  return (
    <div className="no-print border-b border-gray-200 bg-white print:hidden">
      <div className="mx-auto max-w-[1500px] px-5 py-3 lg:px-8">
        <section aria-label={`${group.label} Quick Links`} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="text-sm font-semibold text-gray-800">Quick Links</div>
          <nav className="flex flex-wrap items-center gap-2" aria-label={`${group.label} child pages`}>
            {links.map((link) => {
              const isActive = isLinkMatch(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    'inline-flex min-h-9 items-center whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ' +
                    (isActive
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </section>
      </div>
    </div>
  );
}
