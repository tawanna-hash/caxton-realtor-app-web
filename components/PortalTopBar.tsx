'use client';

// Page title (purple, from the route) + search pill, as in the Mint kit.
// The search jumps to portal sections and sub-pages.

import { useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

const TARGETS = [
  { label: 'Overview', href: '/portal', words: 'dashboard home balance summary' },
  { label: 'Orders and invoices', href: '/portal/orders', words: 'orders invoices pay payment balance agreements receipts' },
  { label: 'Files', href: '/portal/files', words: 'files documents downloads proofs photos' },
  { label: 'My Content', href: '/portal/content', words: 'content hub' },
  { label: 'Monthly issues', href: '/portal/content/issues', words: 'monthly issues magazine pages' },
  { label: 'Event images', href: '/portal/content/events', words: 'events photos images folders' },
  { label: 'Featured articles', href: '/portal/content/articles', words: 'articles featured news' },
  { label: 'Logo files', href: '/portal/content/logos', words: 'logo logos brand upload' },
  { label: 'Locations', href: '/portal/content/locations', words: 'locations offices communities' },
  { label: 'Staff', href: '/portal/content/staff', words: 'staff people team' },
  { label: 'Forms', href: '/portal/forms', words: 'forms complete requested' },
  { label: 'Account', href: '/portal/account', words: 'account billing email contact password login profile address' },
];

function titleFor(pathname: string): string {
  if (pathname.startsWith('/portal/invoices')) return 'Invoice';
  if (pathname.startsWith('/portal/orders')) return 'Orders';
  if (pathname.startsWith('/portal/files')) return 'Files';
  if (pathname.startsWith('/portal/content')) return 'My Content';
  if (pathname.startsWith('/portal/forms')) return 'Forms';
  if (pathname.startsWith('/portal/account')) return 'Account';
  return 'Dashboard';
}

export default function PortalTopBar({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return TARGETS.filter((x) => `${x.label} ${x.words}`.toLowerCase().includes(t)).slice(0, 6);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    ref.current?.blur();
    router.push(href);
  };

  return (
    <div className="mb-5 hidden items-center gap-6 md:flex">
      <div className="text-2xl font-bold text-[#6D3FD6]">{titleFor(pathname)}</div>
      {signedIn && (
        <div className="relative w-full max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (matches[0]) go(matches[0].href);
            }}
          >
            <input
              ref={ref}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              placeholder="Search anything here..."
              aria-label="Search the portal"
              className="w-full rounded-full border border-[#ECE8F5] bg-white py-3 pl-5 pr-12 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#6D3FD6] focus:outline-none"
            />
            <Search className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
          </form>
          {open && q.trim() && (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-[#ECE8F5] bg-white shadow-lg">
              {matches.length === 0 ? (
                <div className="px-5 py-3 text-sm text-gray-500">No matches</div>
              ) : (
                matches.map((m) => (
                  <button key={m.href} type="button" onMouseDown={() => go(m.href)} className="block w-full px-5 py-3 text-left text-sm text-gray-800 hover:bg-[#F6F5FB]">
                    {m.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
