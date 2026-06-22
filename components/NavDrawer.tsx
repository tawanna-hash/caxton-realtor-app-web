'use client';

// components/NavDrawer.tsx
//
// Slide-out left drawer panel. Extracted from AppShell.tsx in S18 so it can be
// reused by the dashboard's "More" bottom-nav tab without wrapping the dashboard
// in AppShell (which would conflict with the dashboard's full-bleed layout).
//
// Presentational: parent owns drawerOpen state, user/auth state, and the pub
// switch + logout handlers. This component just renders.

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ADMIN_NAV } from '@/lib/admin-nav';
import UnreadAdsBadge from '@/components/UnreadAdsBadge';
import BillingAlertsBadge from '@/components/BillingAlertsBadge';
import PushOptInButton from '@/components/PushOptInButton';

type User = { id?: string; email?: string } | null;

interface NavItem {
  label: string;
  href: string;
  placeholder?: boolean;
  adminOnly?: boolean;
  /** Hide this link when no user is signed in. Used to keep auth-gated
   *  routes (e.g. /dashboard, /profile) from masquerading as public links. */
  authOnly?: boolean;
  /** Optional collapsible sub-menu. Parent link remains clickable. */
  subitems?: NavItem[];
}

interface NavSection {
  title?: string;
  items: NavItem[];
  adminOnly?: boolean;
  groups?: { label: string; links: NavItem[] }[];
}

const PUB_NAMES: Record<string, string> = {
  realtyline: 'RealtyLine Austin',
  newsline: 'Newsline San Antonio',
};

// Admin nav is defined in lib/admin-nav.ts so this drawer and the
// desktop top-bar in AppShell.tsx always render the same groups.
// We adapt each canonical link into the drawer's NavItem shape
// (adding `adminOnly: true` so non-admins never see admin links).
const ADMIN_GROUPS: { label: string; links: NavItem[] }[] = ADMIN_NAV.map(
  (g) => ({
    label: g.label,
    links: g.links.map((l) => ({
      label: l.label,
      href: l.href,
      adminOnly: true,
    })),
  }),
);

const DRAWER_SECTIONS: NavSection[] = [
  {
    title: 'Content',
    items: [
      { label: 'Issues', href: '/magazine' },
      { label: 'Calendar', href: '/calendar' },
      { label: 'Giveaways', href: '/giveaways' },
      { label: 'Inventory & Promotions', href: '/inventory' },
      { label: 'Communities', href: '/communities' },
      { label: 'Builders & Developers', href: '/builders' },
      { label: 'Advertisers', href: '/advertisers' },
      { label: 'REALTOR® Resources', href: '/resources' },
    ],
  },
  {
    title: 'Subscribe',
    items: [
      { label: 'Digital Newsletters', href: '/newsletter' },
      { label: 'Subscribe to Print', href: '/subscribe' },
      { label: 'FAQs', href: '/faq' },
    ],
  },
  {
    title: 'About',
    items: [
      { label: 'My Feed', href: '/dashboard', authOnly: true },
      { label: 'About Us', href: '/about' },
      { label: 'Advertise', href: '/advertise' },
      { label: 'Support', href: '/support' },
      { label: 'My Profile', href: '/profile', authOnly: true },
    ],
  },
  {
    title: 'Admin',
    adminOnly: true,
    items: [],
    groups: ADMIN_GROUPS,
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacy Notice', href: '/privacy' },
      { label: 'User Agreement', href: '/terms' },
    ],
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  pub: string;
  drawerBg: string;
  isAdmin: boolean;
  user: User;
  onLogout: () => void;
  onPubSwitch: () => void;
};

export default function NavDrawer({
  open,
  onClose,
  pub,
  drawerBg,
  isAdmin,
  user,
  onLogout,
  onPubSwitch,
}: Props) {
  const pathname = usePathname();

  // Collapsible parent state. Auto-open any parent whose subitem matches the
  // current pathname so users see where they are without a manual click.
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});
  const isSubmenuOpen = (parent: NavItem): boolean => {
    if (openSubmenus[parent.href] !== undefined) return openSubmenus[parent.href];
    if (!parent.subitems) return false;
    return parent.subitems.some(
      (s) => pathname === s.href || pathname.startsWith(s.href + '/'),
    );
  };
  const toggleSubmenu = (parent: NavItem) => {
    setOpenSubmenus((prev) => ({
      ...prev,
      [parent.href]: !isSubmenuOpen(parent),
    }));
  };

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? 'visible' : 'invisible'}`}
      style={{
        transitionDelay: open ? '0ms' : '300ms',
        transitionProperty: 'visibility',
        transitionDuration: '0ms',
      }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${open ? 'opacity-40' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ backgroundColor: drawerBg }}
      >
        {/* Drawer header */}
        <div className="sticky top-0 bg-black/30 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-white/10 z-10">
          <span className="text-xs uppercase tracking-[0.2em] text-white/50 font-medium">
            Realty News Now
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="text-white/70 hover:text-white p-1.5 rounded-md hover:bg-white/10 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="px-5 py-6 space-y-1">
          {DRAWER_SECTIONS.map((section) => {
            if (section.adminOnly && !isAdmin) return null;

            const renderItem = (item: NavItem) => {
              if (item.adminOnly && !isAdmin) return null;
              // Hide auth-only items for logged-out visitors so they don't
              // appear to be public links that bounce to the AuthGate.
              if (item.authOnly && !user) return null;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/');

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

              // Collapsible parent: chevron toggles subitem list; tapping the
              // label itself navigates to the parent's href (overview page).
              if (item.subitems && item.subitems.length > 0) {
                const expanded = isSubmenuOpen(item);
                return (
                  <div key={item.href + item.label}>
                    <div
                      className={`flex items-stretch rounded-md transition ${
                        isActive
                          ? 'text-white bg-white/15'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className="flex-1 px-3 py-2.5 text-sm uppercase tracking-[0.1em] font-medium"
                      >
                        {item.label}
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleSubmenu(item)}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
                        className="px-3 flex items-center justify-center text-white/60 hover:text-white"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform duration-200 ${
                            expanded ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>
                    {expanded && (
                      <div className="mt-1 ml-3 pl-3 border-l border-white/15 space-y-0.5">
                        {item.subitems.map((sub) => {
                          if (sub.adminOnly && !isAdmin) return null;
                          const subActive =
                            pathname === sub.href ||
                            pathname.startsWith(sub.href + '/');
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={onClose}
                              className={`block px-3 py-2 text-[13px] tracking-wide rounded-md transition ${
                                subActive
                                  ? 'text-white bg-white/15 font-medium'
                                  : 'text-white/70 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center px-3 py-2.5 text-sm uppercase tracking-[0.1em] font-medium rounded-md transition ${
                    isActive
                      ? 'text-white bg-white/15'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{item.label}</span>
                  {/* Show unread count next to Ad Inquiries in the mobile drawer */}
                  {item.href === '/admin/ads/inquiries' && (
                    <UnreadAdsBadge variant="inline" />
                  )}
                  {item.href === '/admin/agreements' && (
                    <BillingAlertsBadge variant="inline" />
                  )}
                </Link>
              );
            };

            return (
              <div
                key={section.title ?? 'root'}
                className="py-4 border-b border-white/10 last:border-b-0"
              >
                {section.title ? (
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-4">
                    {section.title}
                  </p>
                ) : null}

                {section.groups ? (
                  <div className="space-y-4">
                    {section.groups.map((group) => (
                      <div key={group.label}>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium mb-2 px-3">
                          {group.label}
                        </p>
                        <div className="space-y-1">{group.links.map(renderItem)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">{section.items.map(renderItem)}</div>
                )}
              </div>
            );
          })}

          {/* Auth section */}
          <div className="py-4 border-t border-white/10 space-y-1">
            {user || isAdmin ? (
              <>
                <div className="px-3 py-1">
                  <PushOptInButton
                    className="inline-flex items-center w-full justify-center px-3 py-2 rounded-md text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition"
                  />
                </div>
                <button
                  onClick={onLogout}
                  className="block w-full text-left px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white/80 font-medium rounded-md hover:text-white hover:bg-white/10 transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                {/* Direct link to the realtor sign-in page. Previously this
                    pointed at '/' which itself redirects to /dashboard and
                    then bounces unauthenticated users back to sign-in — an
                    indirect chain. Targeting /auth/sign-in skips the hops. */}
                <Link
                  href="/auth/sign-in"
                  onClick={onClose}
                  className="block px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white font-medium rounded-md hover:bg-white/10 transition"
                >
                  Login
                </Link>
                {/* Admin login is intentionally not exposed in the public nav.
                    Staff bookmark /admin/login directly. */}
              </>
            )}
          </div>

          <p className="text-[10px] text-white/25 font-light text-center pt-4">
            {'\u00A9'} 2026 Realty News Now
          </p>
        </div>
      </div>
    </div>
  );
}
