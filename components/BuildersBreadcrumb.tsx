'use client';

// components/BuildersBreadcrumb.tsx
//
// Small back-link rendered above /communities and /inventory pages so a
// visitor who lands there via a builder partner link can return to the
// Builders & Developers hub. /builders sub-routes get the same treatment
// via app/(public)/builders/layout.tsx.

import Link from 'next/link';

export default function BuildersBreadcrumb() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
      <Link
        href="/builders"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-gray-500 hover:text-gray-900 transition-colors"
      >
        <span aria-hidden>{'\u2190'}</span>
        Builders &amp; Developers
      </Link>
    </div>
  );
}
