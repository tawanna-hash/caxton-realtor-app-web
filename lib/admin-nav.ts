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
 *  - "Sales" owns the ad-sales funnel end to end: Advertisers -> Inquiries
 *    (leads) -> Agreements (contracts, renewals & the orders pipeline) ->
 *    Invoices, plus the Media Kit (canonical route /admin/ads/media-kit;
 *    /admin/media-kit redirects to it).
 *  - "Ad Ops" holds ad inventory and placements (inventory, placements,
 *    availability). The old /admin/ads hub is reachable by URL but no longer
 *    in the nav — its children are surfaced directly here and under Sales.
 *  - "Mailing List HUB" holds audience lists and subscriber tools.
 *  - "Content" holds editorial surfaces (articles, magazines, events,
 *    giveaways, inventory, social, MLS report cards).
 *  - "Insights" holds dashboards and reporting.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Sales',
    links: [
      { label: 'Advertisers',  href: '/admin/crm',           description: 'Accounts, contacts, share links' },
      { label: 'Inquiries',    href: '/admin/ads/inquiries', description: 'Print / Digital / Email leads' },
      { label: 'Agreements',   href: '/admin/agreements',    description: 'Contracts, renewals & pipeline' },
      { label: 'Invoices',     href: '/admin/invoices',      description: 'Billable charges & payment status' },
      { label: 'Media Kit',    href: '/admin/ads/media-kit',   description: '2026 packages, rates & deadlines' },
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
    label: 'Ad Ops',
    links: [
      { label: 'Ad Inventory', href: '/admin/ads/inventory',    description: 'Slots & creatives' },
      { label: 'Placements',   href: '/admin/ads/placements',   description: 'Live placements' },
      { label: 'Availability', href: '/admin/ads/availability', description: 'Booked windows across channels' },
    ],
  },
  {
    label: 'Content',
    links: [
      { label: 'Trending',  href: '/admin/content/trending', description: 'Rotating feed ticker CTAs' },
      { label: 'Articles',  href: '/admin/articles',  description: 'WordPress feeds & sync' },
      { label: 'Magazines', href: '/admin/magazines', description: 'Digital editions' },
      { label: 'Events',    href: '/admin/events',    description: 'Calendar publications' },
      { label: 'Gmail Events', href: '/admin/events/gmail', description: 'Scanned advertiser & association event mail' },
      { label: 'Event Images', href: '/admin/event-images', description: 'Event photo gallery' },
      { label: 'Feature Articles', href: '/admin/feature-articles', description: 'Editorial features on advertiser pages' },
      { label: 'Giveaways', href: '/admin/giveaways', description: 'Promotions & entries' },
      { label: 'Inventory', href: '/admin/inventory', description: 'Listings & homes' },
      { label: 'Scraper Hub', href: '/admin/content/scrapers', description: 'Run & monitor all scrapers' },
      { label: 'Promotions', href: '/admin/inventory/promotions', description: 'Builder offers & rate buydowns' },
      { label: 'Advertiser Pages', href: '/admin/inventory/builders', description: 'Builder/developer on-off & visibility' },
      { label: 'SABOR Report', href: '/admin/content/saborreport', description: 'San Antonio MLS monthly report card' },
      { label: 'ABOR Report', href: '/admin/content/realtylinereport', description: 'Austin (ABOR) MLS monthly report card' },
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
