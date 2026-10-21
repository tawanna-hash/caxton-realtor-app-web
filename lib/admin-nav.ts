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
  /** href of a parent link in the same group. The desktop sidebar nests this
   *  link under its parent; every other surface keeps a flat list. */
  parent?: string;
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
 *  - "Admin Dashboard" is its own top-level item, always first.
 *  - "Insights" holds reporting and analytics.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    // Pinned first on every surface (desktop sidebar, top bar, mobile drawer).
    label: 'Admin Dashboard',
    links: [
      { label: 'Admin Dashboard', href: '/admin/dashboard', description: 'Publishing, revenue, and operational priorities' },
    ],
  },
  {
    label: 'Sales',
    links: [
      { label: 'Partners',     href: '/admin/crm',           description: 'Accounts, contacts, share links' },
      { label: 'Partner Pages', href: '/admin/inventory/builders', description: 'Builder/developer on-off & visibility', parent: '/admin/crm' },
      { label: 'Referral Network', href: '/admin/referral-network', description: 'Provider applications and approvals' },
      { label: 'Inquiries',    href: '/admin/ads/inquiries', description: 'Print / Digital / Email leads' },
      { label: 'Agreements',   href: '/admin/agreements',    description: 'Contracts, renewals & pipeline' },
      { label: 'Agreements (Beta)', href: '/admin/agreements/renewals-v2', description: 'One-tap renewals and new-partner agreements' },
      { label: 'Proposals (Beta)', href: '/admin/agreements/proposals', description: 'Sent, drafts, archived, templates and defaults' },
      { label: 'Clients (Beta)', href: '/admin/agreements/clients', description: 'Main contact person for each client' },
      { label: 'Contacts (Beta)', href: '/admin/agreements/clients/contacts', description: 'Other people inside each client organization', parent: '/admin/agreements/clients' },
      { label: 'Billing Hub (Beta)', href: '/admin/billing-hub', description: 'Agreement, payment methods, invoices and activity for one client' },
      { label: 'Services (Beta)', href: '/admin/services-beta', description: 'Services, rates, billing occurrence and trigger' },
      { label: 'Media Kit',    href: '/admin/ads/media-kit',   description: '2026 packages, rates & deadlines' },
    ],
  },
  {
    label: 'Get Paid',
    links: [
      { label: 'Get Paid Dashboard', href: '/admin/getpaid/accountsreceivables', description: 'Aging and outstanding balances' },
      { label: 'Sales Transactions', href: '/admin/getpaid/salestransactions', description: 'All customer sales activity' },
      { label: 'Invoices', href: '/admin/getpaid/invoices', description: 'Billable charges and payment status' },
      { label: 'Statements', href: '/admin/getpaid/statements', description: 'Partner balances, statements and payment links' },
      { label: 'Recurring Invoices', href: '/admin/getpaid/reoccuringpayments', description: 'Recurring invoice schedules' },
      { label: 'Stripe Payouts', href: '/admin/getpaid/stripepayouts', description: 'Paid and deposited Stripe activity' },
      { label: 'Deposit Slip', href: '/admin/reports/deposits', description: 'Printable check deposit summary' },
      { label: 'Deposit Detail', href: '/admin/reports/detail', description: 'Printable check payment detail report' },
      { label: 'Products & Services', href: '/admin/getpaid/product&services', description: 'Ad slots, packages and billable items' },
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
      { label: 'Email Subscribers', href: '/admin/newsletter',   description: 'Subscriber email stats & queue' },
      { label: 'Verify Emails',    href: '/admin/email-verify',  description: 'Bulk email verifier (MillionVerifier)' },
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
    label: 'Print Issue',
    links: [
      { label: 'Magazines', href: '/admin/magazines', description: 'Digital editions' },
      { label: 'Monthly Articles', href: '/admin/articles', description: 'WordPress feeds, manual articles & advertiser features' },
    ],
  },
  {
    label: 'Website',
    links: [
      { label: 'Trending',  href: '/admin/content/trending', description: 'Rotating feed ticker CTAs' },
      { label: 'Monthly Articles', href: '/admin/articles', description: 'WordPress feeds, manual articles & advertiser features' },
      { label: 'Event Images', href: '/admin/event-images', description: 'Event photo gallery' },
    ],
  },
  {
    label: 'Calendar Events',
    links: [
      { label: 'All Events', href: '/admin/events', description: 'Calendar publications' },
      { label: 'Gmail Events', href: '/admin/events/gmail', description: 'Scanned advertiser & association event mail' },
    ],
  },
  {
    label: 'Builders',
    links: [
      { label: 'Inventory', href: '/admin/inventory', description: 'Listings & homes' },
      { label: 'Promotions', href: '/admin/inventory/promotions', description: 'Builder offers & rate buydowns' },
      { label: 'Scraper Hub', href: '/admin/content/scrapers', description: 'Run & monitor all scrapers' },
    ],
  },
  {
    label: 'Content',
    links: [
      { label: 'Testimonials', href: '/admin/testimonials', description: 'Review and publish subscriber testimonials', section: 'Editorial' },
      { label: 'Giveaways', href: '/admin/giveaways', description: 'Promotions & entries', section: 'Listings' },
      { label: 'FastEmail Realtor Review', href: '/admin/content/fastemail-realtors', description: 'Review contacts scanned from FastEmail flyers', section: 'Tools' },
      { label: 'Notifications', href: '/admin/notifications', description: 'Web push to subscribers', section: 'Tools' },
    ],
  },
  {
    label: 'Market Reports',
    links: [
      { label: 'SABOR Report', href: '/admin/content/saborreport', description: 'San Antonio MLS monthly report card' },
      { label: 'ABOR Report', href: '/admin/content/realtylinereport', description: 'Austin MLS monthly report card' },
      { label: 'DFW Reports', href: '/admin/content/dfwreport', description: 'MetroTex + GFWAR monthly reports (preview)' },
    ],
  },
  {
    label: 'Closing Time',
    links: [
      { label: 'Closing Time Workspace', href: '/agents/closing-time', description: 'Agent deal workspace and transaction coordinator' },
      { label: 'Office Dashboard', href: '/agents/closing-time/office', description: 'Brokerage-wide deals, risks and CSV export' },
      { label: 'Brokerages & SSO', href: '/admin/brokerages', description: 'Offices, members and single sign-on' },
      { label: 'Agent Center', href: '/admin/agent-center', description: 'Agent tools and official TREC form versions' },
      { label: 'Closing Time Platform', href: '/admin/platform', description: 'System settings, feature switches and releases' },
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
      { label: 'Marketing Performance', href: '/admin/marketing-performance', description: 'Channel attribution, funnel, CAC & ROAS' },
      { label: 'URL Analytics',      href: '/admin/analytics/urls', description: 'Clicks grouped by destination URL' },
    ],
  },
  {
    label: 'Team',
    // Owner-only surface (enforced server-side in app/admin/team, not by
    // hiding the nav link — non-owners who click it see a clear
    // "owner access only" message rather than the roster).
    links: [
      { label: 'Team', href: '/admin/team', description: 'Admin login access & offboarding' },
    ],
  },
];

/** True if the current pathname falls under any link in the group. */
export function isAdminGroupActive(group: AdminNavGroup, pathname: string): boolean {
  return group.links.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + '/'),
  );
}
