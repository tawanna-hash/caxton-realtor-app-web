'use client';

// components/PortalNav.tsx
//
// Advertiser portal navigation. Extracted to a client component so we can
// apply an active-state class via usePathname() and render a responsive
// mobile menu below the md: breakpoint. The previous inline nav in
// app/portal/layout.tsx was a server component with no active state and
// was entirely hidden on phones.

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const ITEMS: { label: string; href: string }[] = [
  { label: 'Overview', href: '/portal' },
  { label: 'Orders', href: '/portal/orders' },
  { label: 'Files', href: '/portal/files' },
  { label: 'Forms', href: '/portal/forms' },
  { label: 'Account', href: '/portal/account' },
];

function isItemActive(pathname: string, href: string): boolean {
  // /portal must match exactly so it doesn't activate on every sub-route.
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function PortalNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop horizontal nav */}
      <nav className="hidden md:flex items-center gap-4 text-sm">
        {ITEMS.map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'text-gray-900 font-medium'
                  : 'text-gray-600 hover:text-gray-900'
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {mobileOpen ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile dropdown sheet */}
      {mobileOpen && (
        <div className="md:hidden absolute left-0 right-0 top-full bg-white border-b border-gray-200 shadow-sm z-30">
          <div className="mx-auto max-w-5xl px-6 py-3 flex flex-col gap-1">
            {ITEMS.map((item) => {
              const active = isItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-2 rounded-md text-sm transition ${
                    active
                      ? 'text-gray-900 font-medium bg-gray-100'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
