'use client';

// components/NavDrawer.tsx
//
// Slide-out left drawer panel. Extracted from AppShell.tsx in S18 so it can be
// reused by the dashboard's "More" bottom-nav tab without wrapping the dashboard
// in AppShell (which would conflict with the dashboard's full-bleed layout).
//
// Presentational: parent owns drawerOpen state, user/auth state, and the pub
// switch + logout handlers. This component just renders.

import { usePathname } from 'next/navigation';
import Link from 'next/link';

type User = { id?: string; email?: string } | null;

interface NavItem {
  label: string;
  href: string;
  placeholder?: boolean;
  adminOnly?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
  adminOnly?: boolean;
  groups?: { label: string; links: NavItem[] }[];
}

const PUB_NAMES: Record<string, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline',
};

// Mirrors AppShell.tsx ADMIN_GROUPS so the drawer renders the same workspace
// structure on mobile (with subheaders) that the desktop top bar uses.
const ADMIN_GROUPS: { label: string; links: NavItem[] }[] = [
  {
    label: 'CRM & Audience',
    links: [
      { label: 'CRM', href: '/admin/crm', adminOnly: true },
      { label: 'Mailing', href: '/admin/mailing', adminOnly: true },
      { label: 'ABOR Members', href: '/admin/mailing/holding', adminOnly: true },
      { label: 'Advertisers', href: '/admin/advertisers', adminOnly: true },
      { label: 'Subscribers', href: '/admin/subscribers', adminOnly: true },
    ],
  },
  {
    label: 'Revenue',
    links: [
      { label: 'Billing', href: '/admin/billing', adminOnly: true },
      { label: 'Ads', href: '/admin/ads', adminOnly: true },
      { label: 'Marketing', href: '/admin/marketing', adminOnly: true },
    ],
  },
  {
    label: 'Content',
    links: [
      { label: 'Magazines', href: '/admin/magazines', adminOnly: true },
      { label: 'Events', href: '/admin/events', adminOnly: true },
      { label: 'Giveaways', href: '/admin/giveaways', adminOnly: true },
      { label: 'Inventory', href: '/admin/inventory', adminOnly: true },
    ],
  },
  {
    label: 'Insights',
    links: [
      { label: 'Metrics', href: '/admin/metrics', adminOnly: true },
      { label: 'Reports', href: '/admin/reports', adminOnly: true },
      { label: 'Analytics', href: '/admin/analytics', adminOnly: true },
    ],
  },
];

const DRAWER_SECTIONS: NavSection[] = [
  {
    title: 'Content',
    items: [
      { label: 'Magazine', href: '/magazine' },
      { label: 'Calendar', href: '/calendar' },
      { label: 'Giveaways', href: '/giveaways' },
      { label: 'Inventory & Promotions', href: '/inventory' },
      { label: 'Communities', href: '/communities' },
      { label: 'Advertisers', href: '/advertisers' },
    ],
  },
  {
    title: 'Subscribe',
    items: [
      { label: 'Digital Newsletters', href: '/newsletter' },
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
      { label: 'My Profile', href: '/profile' },
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
              onClick={onPubSwitch}
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

            const renderItem = (item: NavItem) => {
              if (item.adminOnly && !isAdmin) return null;
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

              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={onClose}
                  className={`block px-3 py-2.5 text-sm uppercase tracking-[0.1em] font-medium rounded-lg transition ${
                    isActive
                      ? 'text-white bg-white/15'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.label}
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
              <button
                onClick={onLogout}
                className="block w-full text-left px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white/80 font-medium rounded-lg hover:text-white hover:bg-white/10 transition"
              >
                Logout
              </button>
            ) : (
              <>
                <Link
                  href="/"
                  onClick={onClose}
                  className="block px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white font-medium rounded-lg hover:bg-white/10 transition"
                >
                  Login
                </Link>
                <Link
                  href="/admin/login"
                  onClick={onClose}
                  className="block px-3 py-2.5 text-sm uppercase tracking-[0.1em] text-white/60 font-medium rounded-lg hover:text-white hover:bg-white/10 transition"
                >
                  Admin Login
                </Link>
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
