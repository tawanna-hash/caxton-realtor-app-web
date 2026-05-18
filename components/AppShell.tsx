'use client';

// components/AppShell.tsx
//
// Unified navigation shell for the entire app. Serves admin, public, and
// (eventually) dashboard contexts with one component.
//
// Desktop: horizontal link bar in the header.
// Mobile: hamburger → full-screen slide-out drawer.
// Role-aware: admin links only render when `isAdmin` is true.
// Publication-aware: drawer background adapts to active publication.
//
// Consumers:
//   - app/admin/layout.tsx (isAdmin=true, detected via pathname)
//   - app/(public)/layout.tsx (isAdmin=false)
//   - app/(dashboard)/layout.tsx — deferred until Option B refactor
//
// Replaces: SiteHeader.tsx, HamburgerMenu.tsx, admin layout inline nav.

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getApiBase } from '@/lib/api-base';

// ============================================================
// Types + constants
// ============================================================

type User = { id?: string; email?: string } | null;

interface NavItem {
  label: string;
  href: string;
  /** If true, link is a placeholder (renders dimmed, no navigation) */
  placeholder?: boolean;
  /** Only show when user has admin role */
  adminOnly?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const PUB_COLORS: Record<string, string> = {
  realtyline: '#021D40',
  newsline: '#3D0740',
  realtynewsnow: '#1a2a44',
};

const PUB_NAMES: Record<string, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline',
};

const ADMIN_LINKS: NavItem[] = [
  { label: 'Giveaways', href: '/admin/giveaways', adminOnly: true },
  { label: 'Events', href: '/admin/events', adminOnly: true },
  { label: 'Ads', href: '/admin/ads', adminOnly: true },
  { label: 'Inventory', href: '/admin/inventory', adminOnly: true },
  { label: 'Metrics', href: '/admin/metrics', adminOnly: true },
  { label: 'Reports', href: '/admin/reports', adminOnly: true },
  { label: 'Analytics', href: '/admin/analytics', adminOnly: true },
  { label: 'Subscribers', href: '/admin/subscribers', adminOnly: true },
];

const DRAWER_SECTIONS: NavSection[] = [
  {
    title: 'Content',
    items: [
      { label: 'Magazine', href: '/dashboard' },
      { label: 'Calendar', href: '/dashboard' },
      { label: 'Giveaways', href: '/giveaways' },
      { label: 'Builder Inventory', href: '/inventory' },
      { label: 'Communities', href: '/communities' },
    ],
  },
  {
    title: 'Subscribe',
    items: [
      { label: 'Digital Newsletters', href: '#', placeholder: true },
      { label: 'Subscribe to Print', href: '/subscribe' },
      { label: 'Manage Subscriptions', href: '#', placeholder: true },
      { label: 'FAQs', href: '/faq' },
    ],
  },
  {
    title: 'About',
    items: [
      { label: 'About Us', href: '/about' },
      { label: 'Advertise', href: '/advertise' },
      { label: 'My Profile', href: '#', placeholder: true },
    ],
  },
  {
    title: 'Admin',
    adminOnly: true,
    items: ADMIN_LINKS,
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacy Notice', href: '/privacy' },
      { label: 'User Agreement', href: '/terms' },
    ],
  },
];

const API = getApiBase();

// ============================================================
// Component
// ============================================================

export default function AppShell({
  children,
  variant = 'public',
}: {
  children: React.ReactNode;
  variant?: 'admin' | 'public';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<User>(null);
  const isAdmin = variant === 'admin';
  const [pub, setPub] = useState<string>(() => {
    if (typeof window === 'undefined') return 'realtynewsnow';
    try { return localStorage.getItem('caxton_pub') || 'realtynewsnow'; } catch { return 'realtynewsnow'; }
  });

  // Hydrate user + pub
  useEffect(() => {
// User auth probe
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.realtor) setUser({ id: data.realtor.id, email: data.realtor.email });
        else setUser(null);
      })
      .catch(() => setUser(null));
  }, []);

  const handleLogout = useCallback(async () => {
    const logoutUrl = isAdmin ? `${API}/admin/auth/logout` : `${API}/auth/logout`;
    try {
      await fetch(logoutUrl, { method: 'POST', credentials: 'include' });
    } catch {}
    if (!isAdmin) {
      try {
        localStorage.removeItem('caxton_pub');
        localStorage.removeItem('caxton_phase');
        localStorage.removeItem('caxton_selected_article');
        localStorage.removeItem('caxton_selected_event');
      } catch {}
    }
    setUser(null);
    setDrawerOpen(false);
    router.push(isAdmin ? '/admin/login' : '/');
  }, [isAdmin, router]);

  const handlePubSwitch = useCallback(() => {
    const other = pub === 'realtyline' ? 'newsline' : 'realtyline';
    try {
      localStorage.setItem('caxton_pub', other);
      window.dispatchEvent(new Event('savedPubChange'));
    } catch {}
    setPub(other);
    setDrawerOpen(false);
  }, [pub]);

  const drawerBg = PUB_COLORS[pub] ?? PUB_COLORS.realtynewsnow;
  const isLoginPage = pathname === '/admin/login';

  // Admin login page — no nav
  if (isLoginPage) {
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ======== TOP BAR ======== */}
      <header className={`sticky top-0 z-40 ${isAdmin ? 'bg-[#1a2a44] text-white' : 'bg-white text-gray-900 border-b border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          {/* Left: hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className={`p-2 rounded-lg transition ${
              isAdmin
                ? 'text-white/70 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Center: brand + badge */}
          <div className="flex items-center gap-2">
            <Link href={isAdmin ? '/admin/giveaways' : '/'} className="text-sm sm:text-base font-semibold tracking-tight">
              {isAdmin ? 'RealtyNewsNow Admin' : 'RealtyNewsNow'}
            </Link>
            {isAdmin ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-white/60">
                Internal
              </span>
            ) : null}
          </div>

          {/* Right: desktop admin links (hidden on mobile) + logout */}
          <div className="flex items-center gap-1">
            {/* Desktop admin links */}
            {isAdmin ? (
              <nav className="hidden lg:flex items-center gap-1 mr-2">
                {ADMIN_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-2.5 py-1.5 text-xs rounded-md transition ${
                      pathname.startsWith(link.href)
                        ? 'text-white bg-white/15'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            ) : null}

            {/* Logout / auth */}
            {user || isAdmin ? (
              <button
                onClick={handleLogout}
                aria-label="Log out"
                className={`p-2 rounded-lg transition ${
                  isAdmin
                    ? 'text-white/60 hover:text-white hover:bg-white/10'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            ) : (
              <span className="w-9" aria-hidden />
            )}
          </div>
        </div>
      </header>

      {/* ======== DRAWER OVERLAY (animated) ======== */}
      <div
        className={`fixed inset-0 z-50 ${drawerOpen ? "visible" : "invisible"}`}
        style={{ transitionDelay: drawerOpen ? "0ms" : "300ms", transitionProperty: "visibility", transitionDuration: "0ms" }}
      >
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black transition-opacity duration-300 ${drawerOpen ? "opacity-40" : "opacity-0"}`}
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div
            className={`absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto shadow-2xl transition-transform duration-300 ease-out ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
            style={{ backgroundColor: drawerBg }}
          >
            {/* Drawer header */}
            <div className="sticky top-0 bg-black/30 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-white/10 z-10">
              <span className="text-xs uppercase tracking-[0.2em] text-white/50 font-medium">
                RealtyNewsNow
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Publication switcher */}
            {!isAdmin && pub !== 'realtynewsnow' ? (
              <div className="px-5 pt-6">
                <button
                  onClick={handlePubSwitch}
                  className="w-full flex items-center justify-between border border-white/25 rounded-lg px-4 py-3 text-white text-sm uppercase tracking-wider font-medium hover:bg-white/5 transition"
                >
                  <span>Switch to {PUB_NAMES[pub === 'realtyline' ? 'newsline' : 'realtyline']}</span>
                  <span className="text-white/50">{'\u2192'}</span>
                </button>
              </div>
            ) : null}

            {/* Sections */}
            <div className="px-5 py-6 space-y-1">
              {DRAWER_SECTIONS.map((section) => {
                if (section.adminOnly && !isAdmin) return null;
                return (
                  <div key={section.title ?? 'root'} className="py-4 border-b border-white/10 last:border-b-0">
                    {section.title ? (
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-4">
                        {section.title}
                      </p>
                    ) : null}
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        if (item.adminOnly && !isAdmin) return null;
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                        if (item.placeholder) {
                          return (
                            <span
                              key={item.label}
                              className="block px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white/30 font-medium cursor-default"
                            >
                              {item.label}
                            </span>
                          );
                        }

                        return (
                          <Link
                            key={item.href + item.label}
                            href={item.href}
                            onClick={() => setDrawerOpen(false)}
                            className={`block px-3 py-2.5 text-sm uppercase tracking-[0.1em] font-medium rounded-lg transition ${
                              isActive
                                ? 'text-white bg-white/15'
                                : 'text-white/80 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Auth section */}
              <div className="py-4 border-t border-white/10">
                {user || isAdmin ? (
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white/80 font-medium rounded-lg hover:text-white hover:bg-white/10 transition"
                  >
                    Logout
                  </button>
                ) : (
                  <Link
                    href="/"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white font-medium rounded-lg hover:bg-white/10 transition"
                  >
                    Login
                  </Link>
                )}
              </div>

              <p className="text-[10px] text-white/25 font-light text-center pt-4">
                {'\u00A9'} 2026 RealtyNewsNow
              </p>
            </div>
          </div>
        </div>

      {/* ======== MAIN CONTENT ======== */}
      <main>{children}</main>
    </div>
  );
}
