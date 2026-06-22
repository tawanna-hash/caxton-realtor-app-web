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
 *  - "CRM" holds people, billing, and brand assets (advertisers, agreements,
 *    invoices, marketing, media kit). Agreements and Invoices are sibling
 *    pages — the legacy /admin/billing route now redirects to Agreements.
 *  - "Revenue" holds ad inventory and placements (ads, orders, availability).
 *  - "Mailing List HUB" holds audience lists and subscriber tools.
 *  - "Content" holds editorial surfaces (articles, magazines, events,
 *    giveaways, inventory, social, MLS report cards).
 *  - "Insights" holds dashboards and reporting.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'CRM',
    links: [
      { label: 'Advertisers',  href: '/admin/crm',        description: 'Accounts, contacts, share links' },
      { label: 'Agreements',   href: '/admin/agreements', description: 'Contracts & renewals' },
      { label: 'Invoices',     href: '/admin/invoices',   description: 'Billable charges & payment status' },
      { label: 'Marketing',    href: '/admin/marketing',  description: 'Outreach campaigns & tasks' },
      { label: 'Media Kit',    href: '/admin/media-kit',  description: '2026 packages, rates & deadlines' },
    ],
  },
  {
    label: 'Mailing List HUB',
    links: [
      // The HUB page itself surfaces every audience segment as a tile, so
      // we keep the nav group tight — just the HUB + Newsletter. ABoR,
      // SABOR, Advertisers List, Non-Advertisers, All Realtors, App
      // Subscribers, and the public subscribe form are all reachable from
      // /admin/mailing.
      { label: 'Mailing List HUB', href: '/admin/mailing',       description: 'All audience lists in one place' },
      { label: 'Newsletter',       href: '/admin/newsletter',    description: 'Subscriber email stats & queue' },
      { label: 'Verify Emails',    href: '/admin/email-verify',  description: 'Ad-hoc single / bulk verifier (no DB writes)' },
    ],
  },
  {
    label: 'Revenue',
    links: [
      { label: 'Ads',             href: '/admin/ads',              description: 'Inventory & placements' },
      { label: 'Ad Inquiries',    href: '/admin/ads/inquiries',    description: 'Print / Digital / Email leads' },
      { label: 'Ad Orders',       href: '/admin/ads/orders',       description: 'Campaigns + agreements pipeline' },
      { label: 'Ad Availability', href: '/admin/ads/availability', description: 'Booked windows across all channels' },
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
      { label: 'SABOR Report', href: '/admin/content/saborreport', description: 'San Antonio MLS monthly report card' },
      { label: 'RealtyLine Report', href: '/admin/content/realtylinereport', description: 'Austin (ABoR) MLS monthly report card' },
      { label: 'Notifications', href: '/admin/notifications', description: 'Web push to subscribers' },
    ],
  },
  {
    label: 'Insights',
    // Three sibling surfaces with distinct data sources:
    //   • Engagement Metrics — in-app click events (builder/dev surfaces)
    //   • Client Reports     — shareable HTML/plaintext recaps for clients
    //   • Site Analytics     — PostHog traffic & user behavior
    // Labels are explicit so admins can tell them apart at a glance.
    links: [
      { label: 'Live Activity',      href: '/admin/activity',  description: 'Real-time public app events (last 7d)' },
      { label: 'Engagement Metrics', href: '/admin/metrics',   description: 'In-app click events & surface engagement' },
      { label: 'Client Reports',     href: '/admin/reports',   description: 'Shareable article, event & advertiser recaps' },
      { label: 'Site Analytics',     href: '/admin/analytics', description: 'PostHog traffic & user behavior' },
    ],
  },
];

/** True if the current pathname falls under any link in the group. */
export function isAdminGroupActive(group: AdminNavGroup, pathname: string): boolean {
  return group.links.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + '/'),
  );
}
