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
import GlobalPullToRefresh from '@/components/GlobalPullToRefresh';
import PushForegroundToast from '@/components/PushForegroundToast';
import NativeStatusBar from '@/components/NativeStatusBar';
import NativeNetworkBanner from '@/components/NativeNetworkBanner';
import NativeAppLifecycle from '@/components/NativeAppLifecycle';
import SwipeBackShell from '@/components/SwipeBackShell';
import { AdSlot } from '@/components/ads/AdSlot';
import NewsletterCTA from '@/components/NewsletterCTA';
import { ADMIN_NAV as ADMIN_GROUPS, isAdminGroupActive as isGroupActive } from '@/lib/admin-nav';
import UnreadAdsBadge from '@/components/UnreadAdsBadge';
import BillingAlertsBadge from '@/components/BillingAlertsBadge';
import PendingGmailBadge from '@/components/PendingGmailBadge';
import MarketSwitcherSheet from '@/components/MarketSwitcherSheet';
import { getActivePub } from '@/lib/publications';

// ============================================================
// Types + constants
// ============================================================

type User = { id?: string; email?: string } | null;

const PUB_COLORS: Record<string, string> = {
  realtyline: '#301D5D',
  newsline: '#301D5D',
  realtynewsnow: '#301D5D',
};

// Top-bar links shown to public (non-admin) visitors on desktop (lg+).
// Mirrors the BottomNav destinations so the desktop and mobile experiences
// stay in sync, plus a Subscribe shortcut. The drawer is still available
// from the hamburger for less-frequent destinations (FAQs, About, Profile).
const PUBLIC_DESKTOP_LINKS: { label: string; href: string }[] = [
  { label: 'Home',        href: '/dashboard' },
  { label: 'Calendar',    href: '/calendar' },
  { label: 'Builders / Developers',    href: '/builders' },
  { label: 'Advertisers', href: '/advertisers' },
  { label: 'Resources',   href: '/resources' },
  { label: 'Subscribe',   href: '/subscribe' },
];

function isPublicLinkActive(pathname: string, href: string): boolean {
  // /dashboard must match exactly so it doesn't light up on every page
  // (root '/' redirects to /dashboard so other public routes would never
  // satisfy startsWith('/dashboard'), but the exact check is still clearer).
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(href + '/');
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
  const [marketSheetOpen, setMarketSheetOpen] = useState(false);
  const [user, setUser] = useState<User>(null);
  const isAdmin = variant === 'admin';
  // Server + first client render default to 'realtyline'. Real value is read from cookie/localStorage in useEffect below.
  // Actual pub is read from localStorage post-mount in the useEffect below.
  const [pub, setPub] = useState<string>('realtyline');
  // Resolve the current pub metadata for the header title-as-switcher.
  // Null when the user hasn't picked yet (first launch) or when the
  // stored id isn't a known active pub — in which case the header falls
  // back to the plain 'Realty News Now' brand link.
  const currentPubMeta = getActivePub(pub);
  useEffect(() => {
    // Defer the localStorage read into a microtask so the first commit lands
    // before this setState — avoids react-hooks/set-state-in-effect.
    try {
      // Cookie is source of truth (set server-side and by handlePubSwitch).
      // localStorage is a legacy mirror. Read both, prefer cookie.
      const cookieMatch = document.cookie.match(/(?:^|;\s*)caxton_pub=([^;]+)/);
      const fromCookie = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
      const fromLs = localStorage.getItem('caxton_pub');
      const saved = fromCookie || fromLs;
      // Defer setState so React commits the initial render first — mirrors
      // the queueMicrotask pattern used by the openMenu / pathname effect
      // below. Satisfies react-hooks/set-state-in-effect.
      if (saved === 'realtyline' || saved === 'newsline') {
        queueMicrotask(() => { setPub(saved); });
      }
    } catch {}

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
      // Flow reorder (2026-07-08): logout preserves market pick + onboarded
      // flag so returning users skip the picker after re-authenticating.
      // Clear ONLY session/phase state and article/event selections.
      try {
        localStorage.removeItem('caxton_phase');
        localStorage.removeItem('caxton_selected_article');
        localStorage.removeItem('caxton_selected_event');
      } catch {}
    }
    setUser(null);
    setDrawerOpen(false);
    router.push(isAdmin ? '/admin/login' : '/login');
  }, [isAdmin, router]);

  const handlePubSwitch = useCallback(() => {
    const other = pub === 'realtyline' ? 'newsline' : 'realtyline';
    try {
      // Cookie is the source of truth; localStorage is a legacy mirror.
      const maxAge = 60 * 60 * 24 * 365;
      document.cookie = `caxton_pub=${other}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem('caxton_pub', other);
      // Also clear any saved phase/selection so we don't strand the user on
      // an article that belongs to the previous pub.
      localStorage.removeItem('caxton_selected_article');
      localStorage.removeItem('caxton_selected_event');
      window.dispatchEvent(new Event('savedPubChange'));
    } catch {}
    setPub(other);
    setDrawerOpen(false);
    // No hard reload — persistPub() dispatched 'savedPubChange'.
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
    return <div className="min-h-screen bg-white flex flex-col">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ======== TOP BAR ======== */}
      <header className={`sticky top-0 z-40 ${isAdmin ? 'bg-brand-700 text-white' : 'bg-white text-gray-900 border-b border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          {/* Left: hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className={`p-2 rounded-md transition lg:hidden ${
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

          {/* Center: brand + badge
              For signed-in (non-admin) users the title is the
              title-as-switcher (iOS HIG pattern). Tapping it opens the
              MarketSwitcherSheet. Admin keeps the static brand. */}
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <Link href="/admin" className="text-sm sm:text-base font-semibold tracking-tight">
                  Realty News Now Admin
                </Link>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-white/60">
                  Internal
                </span>
              </>
            ) : (() => {
              // Always render the switcher. Fall back to the RealtyLine
              // meta if lookup returned null (fresh WebView, no cookie/ls
              // yet, unknown pub value, etc.) — the switcher must be
              // available on every page.
              const meta = currentPubMeta ?? { id: 'realtyline', label: 'RealtyLine', monogram: 'RL' };
              return (
                <button
                  type="button"
                  onClick={() => setMarketSheetOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={marketSheetOpen}
                  aria-label={`Switch publication. Current: ${meta.label}`}
                  className="flex flex-col items-center leading-tight px-2 py-0.5 rounded-md hover:bg-gray-50 active:bg-gray-100 transition"
                >
                  <span className="flex items-center gap-1 text-sm sm:text-base font-semibold tracking-tight text-gray-900">
                    {meta.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium">
                    Realty News Now
                  </span>
                </button>
              );
            })()}
          </div>

          {/* Right: desktop admin dropdowns (hidden on mobile) + logout */}
          <div className="flex items-center gap-1">
            {/* Desktop nav. Admins get dropdown menus grouped by domain;
                public visitors get a flat link bar mirroring BottomNav so
                desktop users see the same destinations as mobile. */}
            {isAdmin ? (
              <nav ref={navRef} className="hidden lg:flex items-center gap-1 mr-2 relative">
                {ADMIN_GROUPS.map((group, groupIdx) => {
                  // Anchor menus so they extend in the direction with the
                  // most room. The first three groups (leftmost) open to
                  // the right; the last two open to the left so they don't
                  // run off the right edge of narrow laptop screens.
                  const menuAlign =
                    groupIdx >= ADMIN_GROUPS.length - 2 ? 'right-0' : 'left-0';
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
                        {/* Surface unread ad inquiries as a red dot on the
                            group that owns Ad Inquiries; expiring/overdue
                            billing as an amber dot on the group that owns
                            Billing. Driven by group membership so the
                            badges follow links if the nav is reorganized. */}
                        {group.links.some((l) => l.href === '/admin/ads/inquiries') && (
                          <UnreadAdsBadge />
                        )}
                        {group.links.some((l) => l.href === '/admin/agreements') && (
                          <BillingAlertsBadge />
                        )}
                        {group.links.some((l) => l.href === '/admin/events/gmail') && (
                          <PendingGmailBadge />
                        )}
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
                          className={`absolute ${menuAlign} mt-1.5 min-w-[16rem] rounded-md bg-white text-gray-900 shadow-lg border border-gray-200 py-1.5 z-50`}
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
                                <div className="font-medium flex items-center">
                                  <span>{link.label}</span>
                                  {/* Inline unread count next to the Ad
                                      Inquiries link so admins see how many
                                      new leads are waiting without leaving
                                      the dropdown. */}
                                  {link.href === '/admin/ads/inquiries' && (
                                    <UnreadAdsBadge variant="inline" />
                                  )}
                                  {link.href === '/admin/agreements' && (
                                    <BillingAlertsBadge variant="inline" />
                                  )}
                                  {link.href === '/admin/events/gmail' && (
                                    <PendingGmailBadge variant="inline" />
                                  )}
                                </div>
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
            ) : (
              <nav className="hidden lg:flex items-center gap-1 mr-2">
                {PUBLIC_DESKTOP_LINKS.map((link) => {
                  const active = isPublicLinkActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={`px-3 py-1.5 text-xs uppercase tracking-[0.15em] rounded-md transition ${
                        active
                          ? 'text-gray-900 bg-gray-100 font-medium'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* Logout lives in the More drawer — no header icon.
                Render a same-size spacer so the centered title stays
                visually centered relative to the hamburger on the left. */}
            <span className="w-9" aria-hidden />
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

      {/* ======== MARKET SWITCHER SHEET ========
          iOS HIG title-as-switcher pattern. Triggered from the header
          title for non-admin users; renders nothing while closed. */}
      {!isAdmin && (
        <MarketSwitcherSheet
          open={marketSheetOpen}
          currentPub={pub}
          onClose={() => setMarketSheetOpen(false)}
        />
      )}

      {/* ======== MAIN CONTENT ======== */}
      {/* App-wide pull-to-refresh — public variant only. Dashboard manages
          its own tab-aware PTR so this component opts itself out there. */}
      {!isAdmin && <GlobalPullToRefresh />}
      <PushForegroundToast />
      <NativeStatusBar />
      <NativeNetworkBanner />
      <NativeAppLifecycle />
      {/* SwipeBackShell wraps just the main content — the sticky chrome
          (header, drawer, BottomNav) intentionally stays put while only
          the page contents track the finger. The shell maps the AppShell
          variant to the area the swipe-back rules expect. */}
      <main className="flex-1 pb-20">
        <SwipeBackShell area={isAdmin ? 'admin' : 'public'}>
          {children}
        </SwipeBackShell>
      </main>
      {!isAdmin ? (
        <>
          {/* Inline newsletter signup — shown on every public page above the footer. */}
          <NewsletterCTA source="public_footer" variant="flush" />
          {/* Inline footer banner (paid placement) — scrolls with the page,
              sits above the site footer. Previously fixed at bottom-16, but
              overlapped sticky page UI (calc floater, etc). */}
          <div className="px-3 py-4">
            <div className="max-w-3xl mx-auto">
              <AdSlot slug="feed_sticky_bottom" variant="bare" />
            </div>
          </div>
          <BottomNav info={null} onMoreClick={() => setDrawerOpen(true)} />
        </>
      ) : null}
      {/* Admin chrome stays admin-only — the public Footer (RealtyLine /
          Newsline San Antonio / Resources columns) was leaking onto every /admin page. */}
      {!isAdmin && <Footer />}
    </div>
  );
}
