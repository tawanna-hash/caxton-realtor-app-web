'use client';

// app/(public)/resources/layout.tsx
//
// Adds a "Back to REALTOR Resources" breadcrumb above each calculator
// sub-page (mortgage, commission, title, net sheet, etc.) so users who
// deep-link into a single tool can discover the rest of the resources
// hub. The link is suppressed on the /resources index itself.
//
// Client component so we can read the current pathname.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isIndex = [
    '/resources',
    '/resources/',
    '/resources/guides',
    '/resources/guides/',
    '/resources/links',
    '/resources/links/',
  ].includes(pathname);

  return (
    <>
      {!isIndex && (
        <div className="max-w-5xl mx-auto px-6 pt-6">
          <Link
            href="/resources"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span aria-hidden>{'\u2190'}</span>
            REALTOR® Calculators &amp; Quick References
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
