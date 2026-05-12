'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

const PUBS = [
  { id: 'realtyline', name: 'RealtyLine', color: '#021D40', city: 'Austin' },
  { id: 'newsline', name: 'Newsline', color: '#3D0740', city: 'San Antonio' },
];

type User = { id?: string; email?: string; guest?: boolean } | null;

export default function HamburgerMenu({
  open,
  onClose,
  user,
  pub,
  showPublicationSwitcher,
  onLogout,
  onPublicationSwitch,
  onInternalNav,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  pub: string;
  showPublicationSwitcher: boolean;
  onLogout: () => void;
  onPublicationSwitch?: () => void;
  onInternalNav?: (target: 'magazines' | 'events') => void;
}) {
  const router = useRouter();
  const info = PUBS.find((p) => p.id === pub) || PUBS[0];
  const other = PUBS.find((p) => p.id !== pub) || PUBS[1];

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function goInternal(target: 'magazines' | 'events') {
    onClose();
    if (onInternalNav) {
      onInternalNav(target);
    } else {
      // On non-dashboard routes, route to the dashboard which will handle the phase
      try {
        localStorage.setItem('caxton_phase', target);
      } catch {}
      router.push('/');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: info.color }}
    >
      <div className="sticky top-0 bg-black px-3 py-3 flex items-center justify-between border-b border-white/10 z-10">
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="text-white p-2"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
        <p className="text-sm uppercase tracking-[0.25em] text-white/50 font-medium">
          HarmonyOne
        </p>
        <div className="w-10" />
      </div>

      <div className="px-6 py-8 pb-32">
        {showPublicationSwitcher && onPublicationSwitch && (
          <button
            onClick={() => { onClose(); onPublicationSwitch(); }}
            className="w-full flex items-center justify-between border border-white/30 px-4 py-3.5 text-white text-sm uppercase tracking-wider font-medium mb-10"
          >
            <span>Switch to {other.name}</span>
            <span className="text-white/60">{'\u2192'}</span>
          </button>
        )}

        {/* Section 1 — Content */}
        <div className="mb-10">
          <div className="space-y-5">
            <button
              onClick={() => goInternal('magazines')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Magazine
            </button>
            <button
              onClick={() => goInternal('events')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Calendar
            </button>
            <button
              onClick={() => go('/giveaways')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Giveaways
            </button>
            <button
              onClick={() => go('/inventory')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Builder Inventory
            </button>
            <button
              onClick={() => go('/builder-promotions')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Builder Promotions
            </button>
          </div>
        </div>
{/* Section 2 — Subscriptions & info */}
        <div className="mb-10 pt-6 border-t border-white/20">
          <div className="space-y-5">
            <a href="#" className="block text-sm uppercase tracking-[0.15em] text-white/60 font-medium">
              Digital Newsletters
            </a>
            <a href="/subscribe" className="block text-sm uppercase tracking-[0.15em] text-white/60 font-medium">
              Subscribe to Print
            </a>
            <a href="#" className="block text-sm uppercase tracking-[0.15em] text-white/60 font-medium">
              Manage Subscriptions
            </a>
            <button
              onClick={() => go('/faq')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              FAQs
            </button>
          </div>
        </div>

        {/* Section 3 — About + account */}
        <div className="mb-10 pt-6 border-t border-white/20">
          <div className="space-y-5">
            <button
              onClick={() => go('/about')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              About Us
            </button>
            <button
              onClick={() => go('/advertise')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Advertise
            </button>
            <a href="#" className="block text-sm uppercase tracking-[0.15em] text-white/60 font-medium">
              My Profile
            </a>
            <Link
              href="/admin/login"
              onClick={onClose}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium"
            >
              Admin Login
            </Link>
          </div>
        </div>

        {/* Section 4 — Legal */}
        <div className="mb-10 pt-6 border-t border-white/20">
          <div className="space-y-5">
            <button
              onClick={() => go('/privacy')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Privacy Notice
            </button>
            <button
              onClick={() => go('/terms')}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              User Agreement
            </button>
          </div>
        </div>

        {/* Section 5 — Auth */}
        <div className="mb-10 pt-6 border-t border-white/20">
          {user ? (
            <button
              onClick={() => { onClose(); onLogout(); }}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/"
              onClick={onClose}
              className="block text-sm uppercase tracking-[0.15em] text-white font-medium"
            >
              Login
            </Link>
          )}
        </div>

        <p className="text-xs text-white/30 font-light text-center pt-4">
          {'\u00A9'} 2026 Caxton Publications, Inc.
        </p>
      </div>
    </div>
  );
}
