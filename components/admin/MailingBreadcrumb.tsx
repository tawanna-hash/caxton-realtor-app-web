// components/admin/MailingBreadcrumb.tsx
//
// Shared chevron-style breadcrumb rendered above every page in the
// Mailing List Hub (/admin/mailing/*). Keeps wayfinding consistent
// across the hub, segment pages, SABOR Members, and ABOR Members.

import Link from 'next/link';

export type MailingCrumb = {
  label: string;
  href?: string; // omit on the final (current) crumb
};

export default function MailingBreadcrumb({
  trail,
}: {
  trail: MailingCrumb[];
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 text-sm text-gray-500"
    >
      <Link href="/admin" className="hover:text-gray-900">
        Admin
      </Link>
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-2">
            <span aria-hidden>{'\u203A'}</span>
            {c.href && !isLast ? (
              <Link href={c.href} className="hover:text-gray-900">
                {c.label}
              </Link>
            ) : (
              <span className="text-gray-900">{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
