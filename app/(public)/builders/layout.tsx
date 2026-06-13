'use client';

// app/(public)/builders/layout.tsx
//
// Adds a "Builders & Developers" breadcrumb above each builders sub-page
// so visitors who deep-link into a builder profile can return to the hub.
// The link is suppressed on the /builders index itself.
//
// Sibling routes /communities and /inventory live outside this layout
// (separate top-level public folders), so they have their own opt-in
// breadcrumb component rather than relying on this wrapper.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BuildersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isIndex = pathname === '/builders' || pathname === '/builders/';

  return (
    <>
      {!isIndex && (
        <div className="max-w-5xl mx-auto px-6 pt-6">
          <Link
            href="/builders"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span aria-hidden>{'\u2190'}</span>
            Builders &amp; Developers
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
