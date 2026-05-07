'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (pathname.startsWith('/signup') || pathname.startsWith('/login') || pathname.startsWith('/verify')) {
    return null;
  }

  const navItems = [
    { href: '/dashboard', label: 'Home' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/event-images', label: 'Event Images' },
    { href: '/advertisers', label: 'Advertisers' },
    { href: '/trec-lookup', label: 'TREC Lookup' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-end gap-6">
            <Link href="/dashboard" className="flex items-center">
              <img src="/realtyline-logo.png" alt="RealtyLine" className="h-10" />
            </Link>
            <div className="h-8 w-px bg-gray-300" />
            <Link href="/dashboard" className="flex items-center">
              <img src="/newsline-logo.png" alt="Newsline San Antonio" className="h-12" />
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={`text-sm font-medium transition-colors hover:text-blue-600 ${pathname === item.href ? 'text-blue-600' : 'text-gray-600'}`}>
                {item.label}
              </Link>
            ))}
            <Link href="/profile" className="ml-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
              Profile
            </Link>
          </nav>
          <button className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <nav className="px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={`block px-4 py-2 rounded-md text-sm font-medium transition-colors ${pathname === item.href ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => setMobileMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link href="/profile" className="block px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors" onClick={() => setMobileMenuOpen(false)}>
              Profile
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
