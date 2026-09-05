// lib/admin-nav.ts
//
// Single source of truth for the admin navigation. Both the desktop
// top-bar dropdowns in components/AppShell.tsx and the mobile hamburger
// drawer in components/NavDrawer.tsx import from here. Add or move a
// link in this file and both surfaces stay in sync.

type AdminNavLink = {
  label: string;
  href: string;
  description?: string;
  /** Optional desktop-menu tab. Mobile keeps rendering one flat list. */
  section?: 'Editorial' | 'Events' | 'Listings' | 'Tools';
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
      { label: 'Partners',     href: '/admin/crm',           description: 'Accounts, contacts, share links' },
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
      { label: 'Trending',  href: '/admin/content/trending', description: 'Rotating feed ticker CTAs', section: 'Editorial' },
      { label: 'Articles',  href: '/admin/articles',  description: 'WordPress feeds & sync', section: 'Editorial' },
      { label: 'Magazines', href: '/admin/magazines', description: 'Digital editions', section: 'Editorial' },
      { label: 'Feature Articles', href: '/admin/feature-articles', description: 'Editorial features on advertiser pages', section: 'Editorial' },
      { label: 'Testimonials', href: '/admin/testimonials', description: 'Review and publish subscriber testimonials', section: 'Editorial' },
      { label: 'Events',    href: '/admin/events',    description: 'Calendar publications', section: 'Events' },
      { label: 'Gmail Events', href: '/admin/events/gmail', description: 'Scanned advertiser & association event mail', section: 'Events' },
      { label: 'Event Images', href: '/admin/event-images', description: 'Event photo gallery', section: 'Events' },
      { label: 'Inventory', href: '/admin/inventory', description: 'Listings & homes', section: 'Listings' },
      { label: 'Promotions', href: '/admin/inventory/promotions', description: 'Builder offers & rate buydowns', section: 'Listings' },
      { label: 'Partner Pages', href: '/admin/inventory/builders', description: 'Builder/developer on-off & visibility', section: 'Listings' },
      { label: 'Giveaways', href: '/admin/giveaways', description: 'Promotions & entries', section: 'Listings' },
      { label: 'Scraper Hub', href: '/admin/content/scrapers', description: 'Run & monitor all scrapers', section: 'Tools' },
      { label: 'FastEmail Realtor Review', href: '/admin/content/fastemail-realtors', description: 'Review contacts scanned from FastEmail flyers', section: 'Tools' },
      { label: 'SABOR Report', href: '/admin/content/saborreport', description: 'San Antonio MLS monthly report card', section: 'Tools' },
      { label: 'ABOR Report', href: '/admin/content/realtylinereport', description: 'Austin MLS monthly report card', section: 'Tools' },
      { label: 'Notifications', href: '/admin/notifications', description: 'Web push to subscribers', section: 'Tools' },
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
      { label: 'URL Analytics',      href: '/admin/analytics/urls', description: 'Clicks grouped by destination URL' },
    ],
  },
];

/** True if the current pathname falls under any link in the group. */
export function isAdminGroupActive(group: AdminNavGroup, pathname: string): boolean {
  return group.links.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + '/'),
  );
}

/**
 * Human-readable title for the current admin route, used by the mobile
 * header where there's no room for the desktop dropdown bar.
 *
 * Prefers the label of the most specific matching ADMIN_NAV link so the
 * header text always matches what the user tapped in the drawer. Routes
 * that aren't in the nav (detail pages, one-off tools) fall back to a
 * prettified final path segment.
 */
export function getAdminNavTitle(pathname: string): string {
  let best: AdminNavLink | null = null;
  for (const group of ADMIN_NAV) {
    for (const link of group.links) {
      const matches = pathname === link.href || pathname.startsWith(link.href + '/');
      if (matches && (!best || link.href.length > best.href.length)) best = link;
    }
  }
  if (best) return best.label;

  const segments = pathname.split('/').filter(Boolean).slice(1);
  // Dynamic segments resolve to opaque ids — name the parent segment instead.
  const last = /^[0-9a-f-]{8,}$/i.test(segments[segments.length - 1] ?? '')
    ? segments[segments.length - 2]
    : segments[segments.length - 1];
  if (!last) return 'Admin';
  return last
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
