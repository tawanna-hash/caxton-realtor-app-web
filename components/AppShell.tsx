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

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getApiBase } from '@/lib/api-base';
import { Footer } from '@/components/footer';
import NavDrawer from '@/components/NavDrawer';
import BottomNav from '@/components/BottomNav';
import { AdSlot } from '@/components/ads/AdSlot';
import NewsletterCTA from '@/components/NewsletterCTA';

// ============================================================
// Types + constants
// ============================================================

type User = { id?: string; email?: string } | null;

const PUB_COLORS: Record<string, string> = {
  realtyline: '#021D40',
  newsline: '#3D0740',
  realtynewsnow: '#1a2a44',
};

// Admin nav is grouped into logical sections. On desktop each group is
// rendered as a dropdown menu button; on mobile the drawer continues to
// show section headers + flat links.
type AdminLink = { label: string; href: string; description?: string };
type AdminGroup = { label: string; links: AdminLink[] };

const ADMIN_GROUPS: AdminGroup[] = [
  {
    label: 'CRM & Audience',
    links: [
      { label: 'CRM',              href: '/admin/crm',             description: 'Advertisers / clients pipeline' },
      { label: 'Mailing List',     href: '/admin/mailing',         description: 'Segment lists & exports' },
      { label: 'Holding Contacts', href: '/admin/mailing/holding', description: 'Scraped contacts awaiting review' },
      { label: 'Advertisers',      href: '/admin/advertisers',     description: 'Active accounts' },
      { label: 'Subscribers',      href: '/admin/subscribers',     description: 'Newsletter signups' },
    ],
  },
  {
    label: 'Revenue',
    links: [
      { label: 'Billing',   href: '/admin/billing',   description: 'Invoices & payments' },
      { label: 'Ads',       href: '/admin/ads',       description: 'Inventory & placements' },
      { label: 'Marketing', href: '/admin/marketing', description: 'Campaigns & assets' },
    ],
  },
  {
    label: 'Content',
    links: [
      { label: 'Magazines', href: '/admin/magazines', description: 'Digital editions' },
      { label: 'Events',    href: '/admin/events',    description: 'Calendar publications' },
      { label: 'Giveaways', href: '/admin/giveaways', description: 'Promotions & entries' },
      { label: 'Inventory', href: '/admin/inventory', description: 'Listings & homes' },
    ],
  },
  {
    label: 'Insights',
    links: [
      { label: 'Metrics',   href: '/admin/metrics',   description: 'KPI dashboards' },
      { label: 'Reports',   href: '/admin/reports',   description: 'Saved reports' },
      { label: 'Analytics', href: '/admin/analytics', description: 'Traffic & engagement' },
    ],
  },
];

function isGroupActive(group: AdminGroup, pathname: string): boolean {
  return group.links.some((l) => pathname.startsWith(l.href));
}

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
  // Server + first client render agree on 'realtynewsnow' to avoid hydration mismatch.
  // Actual pub is read from localStorage post-mount in the useEffect below.
  const [pub, setPub] = useState<string>('realtynewsnow');

  useEffect(() => {
    // Defer the localStorage read into a microtask so the first commit lands
    // before this setState — avoids react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem('caxton_pub');
        if (saved) setPub(saved);
      } catch {}
    });

    // Listen for cross-tab pub changes (NavDrawer's pub switch dispatches this event)
    function onPubChange() {
      try {
        const saved = localStorage.getItem('caxton_pub');
        if (saved) setPub(saved);
      } catch {}
    }
    window.addEventListener('savedPubChange', onPubChange);
    return () => window.removeEventListener('savedPubChange', onPubChange);
  }, []);

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

  // Dropdown menu state — which admin group is currently open. null = none.
  // Declared before any early return to keep hook order stable.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Close menus on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  // Close menu when route changes
  useEffect(() => {
    queueMicrotask(() => { setOpenMenu(null); });
  }, [pathname]);

  const drawerBg = PUB_COLORS[pub] ?? PUB_COLORS.realtynewsnow;
  const isLoginPage = pathname === '/admin/login';

  // Admin login page — no nav
  if (isLoginPage) {
    return <div className="min-h-screen bg-gray-50 flex flex-col">{children}</div>;
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
              {isAdmin ? 'Realty News Now Admin' : 'Realty News Now'}
            </Link>
            {isAdmin ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-white/60">
                Internal
              </span>
            ) : null}
          </div>

          {/* Right: desktop admin dropdowns (hidden on mobile) + logout */}
          <div className="flex items-center gap-1">
            {/* Desktop admin dropdown menus */}
            {isAdmin ? (
              <nav ref={navRef} className="hidden lg:flex items-center gap-1 mr-2 relative">
                {ADMIN_GROUPS.map((group) => {
                  const isOpen   = openMenu === group.label;
                  const isActive = isGroupActive(group, pathname);
                  return (
                    <div key={group.label} className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenu(isOpen ? null : group.label)}
                        onMouseEnter={() => { if (openMenu) setOpenMenu(group.label); }}
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        className={`px-3 py-1.5 text-xs rounded-md transition inline-flex items-center gap-1 ${
                          isOpen
                            ? 'text-white bg-white/15'
                            : isActive
                              ? 'text-white bg-white/10 hover:bg-white/15'
                              : 'text-white/70 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span>{group.label}</span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          aria-hidden
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div
                          role="menu"
                          className="absolute right-0 mt-1.5 min-w-[16rem] rounded-lg bg-white text-gray-900 shadow-lg border border-gray-200 py-1.5 z-50"
                        >
                          <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold">
                            {group.label}
                          </div>
                          {group.links.map((link) => {
                            const linkActive = pathname.startsWith(link.href);
                            return (
                              <Link
                                key={link.href}
                                href={link.href}
                                role="menuitem"
                                onClick={() => setOpenMenu(null)}
                                className={`block px-3 py-2 text-sm transition ${
                                  linkActive
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                              >
                                <div className="font-medium">{link.label}</div>
                                {link.description && (
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    {link.description}
                                  </div>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
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

      {/* ======== DRAWER (extracted to NavDrawer in S18) ======== */}
      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pub={pub}
        drawerBg={drawerBg}
        isAdmin={isAdmin}
        user={user}
        onLogout={handleLogout}
        onPubSwitch={handlePubSwitch}
      />

      {/* ======== MAIN CONTENT ======== */}
      <main className="flex-1 pb-20">{children}</main>
      {!isAdmin ? (
        <>
          {/* Inline newsletter signup — shown on every public page above the footer. */}
          <NewsletterCTA source="public_footer" variant="flush" />
          {/* Sticky footer banner (paid placement) — sits above bottom nav */}
          <div className="fixed bottom-16 left-0 right-0 z-20 pointer-events-none px-3">
            <div className="max-w-3xl mx-auto pointer-events-auto">
              <AdSlot slug="feed_sticky_bottom" variant="bare" />
            </div>
          </div>
          <BottomNav info={null} onMoreClick={() => setDrawerOpen(true)} />
        </>
      ) : null}
      <Footer />
    </div>
  );
}
