// lib/admin-nav.ts
//
// Single source of truth for the admin navigation. Both the desktop
// top-bar dropdowns in components/AppShell.tsx and the mobile hamburger
// drawer in components/NavDrawer.tsx import from here. Add or move a
// link in this file and both surfaces stay in sync.

export type AdminNavLink = {
  label: string;
  href: string;
  description?: string;
};

export type AdminNavGroup = {
  label: string;
  links: AdminNavLink[];
};

/**
 * Admin navigation groups, displayed left-to-right on desktop and
 * top-to-bottom on mobile. Order matters.
 *
 * Conventions:
 *  - "CRM" holds people and brand assets (advertisers, contacts, media kit).
 *  - "Revenue" holds money movement (billing, ads, marketing).
 *  - "Mailing List HUB" holds audience lists and subscriber tools.
 *  - "Content" holds editorial surfaces (articles, magazines, events,
 *    giveaways, inventory).
 *  - "Insights" holds dashboards and reporting.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'CRM',
    links: [
      { label: 'Advertisers & CRM', href: '/admin/crm', description: 'Accounts, contacts, share links' },
      { label: 'Media Kit',         href: '/admin/media-kit', description: '2026 packages, rates & deadlines' },
    ],
  },
  {
    label: 'Mailing List HUB',
    links: [
      { label: 'Mailing List HUB',  href: '/admin/mailing',               description: 'All audience lists in one place' },
      { label: 'ABOR Members',      href: '/admin/mailing/holding',       description: 'Austin agents awaiting review' },
      { label: 'SABOR Members',     href: '/admin/mailing/sabor-members', description: 'San Antonio realtor mirror' },
      { label: 'App Subscribers',   href: '/admin/subscribers',           description: 'Newsletter signups' },
      { label: 'Five Points Board', href: '/admin/five-points-board',     description: 'Coming soon' },
      { label: 'Manual Subscribe',  href: '/subscribe',                   description: 'Add a subscriber by hand' },
    ],
  },
  {
    label: 'Revenue',
    links: [
      { label: 'Billing',   href: '/admin/billing',   description: 'Agreements, invoices & payments' },
      { label: 'Ads',       href: '/admin/ads',       description: 'Inventory & placements' },
      { label: 'Marketing', href: '/admin/marketing', description: 'Campaigns & assets' },
    ],
  },
  {
    label: 'Content',
    links: [
      { label: 'Articles',  href: '/admin/articles',  description: 'WordPress feeds & sync' },
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
      { label: 'Analytics', href: '/admin/analytics', description: 'Site-wide traffic & engagement' },
    ],
  },
];

/** True if the current pathname falls under any link in the group. */
export function isAdminGroupActive(group: AdminNavGroup, pathname: string): boolean {
  return group.links.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + '/'),
  );
}
