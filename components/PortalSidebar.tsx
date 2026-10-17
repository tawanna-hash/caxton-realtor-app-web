'use client';

// components/PortalSidebar.tsx
//
// Partner portal navigation in the Mint UI kit style: left sidebar with the
// market logo, rounded nav items with a purple active state and accent bar,
// and a purple user card at the bottom. Collapses to a top bar + drawer on
// small screens.

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, FolderOpen, Images, LayoutDashboard, Menu, ShoppingBag, User, X } from 'lucide-react';

const ITEMS = [
  { label: 'Overview', href: '/portal', Icon: LayoutDashboard },
  { label: 'Orders', href: '/portal/orders', Icon: ShoppingBag },
  { label: 'Files', href: '/portal/files', Icon: FolderOpen },
  { label: 'My Content', href: '/portal/content', Icon: Images },
  { label: 'Forms', href: '/portal/forms', Icon: ClipboardList },
  { label: 'Account', href: '/portal/account', Icon: User },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function PortalSidebar({
  logoSrc,
  logoAlt,
  name,
  email,
  signedIn,
}: {
  logoSrc: string;
  logoAlt: string;
  name: string | null;
  email: string | null;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1 px-4">
      {signedIn &&
        ITEMS.map(({ label, href, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition ${
                active ? 'bg-[#EEE9FA] font-bold text-[#301D5D]' : 'text-gray-700 hover:bg-[#F6F5FB]'
              }`}
            >
              {active && <span className="absolute -left-4 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-[#301D5D]" aria-hidden />}
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}
    </nav>
  );

  const userCard = signedIn && name && (
    <div className="mx-4 mb-6 rounded-2xl bg-[#301D5D] p-4 text-white">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-bold">
          {name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{name}</div>
          {email && <div className="truncate text-xs text-white/70">{email}</div>}
        </div>
      </div>
      <form action="/portal/logout" method="post" className="mt-3">
        <button className="w-full rounded-full border border-white/40 py-1.5 text-xs font-medium hover:bg-white/10">Sign out</button>
      </form>
    </div>
  );

  const logo = (
    <Link href="/portal" className="block px-8 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} alt={logoAlt} className="h-9 w-auto max-w-full" />
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[#ECE8F5] bg-white md:flex">
        {logo}
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {userCard}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#ECE8F5] bg-white px-4 py-3 md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt={logoAlt} className="h-8 w-auto" />
        {signedIn && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close menu' : 'Open menu'} className="rounded-full p-2 text-[#301D5D] hover:bg-[#F6F5FB]">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute left-0 top-[57px] bottom-0 flex w-72 flex-col bg-white pt-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {userCard}
          </div>
        </div>
      )}
    </>
  );
}
