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
    // Top-level sidebar item right under the dashboard. Partner records and
    // Partner Pages (builder/developer page visibility) are one workspace.
    label: 'Partners',
    links: [
      { label: 'Partners', href: '/admin/crm', description: 'Accounts, contacts, share links and partner pages' },
    ],
  },
  {
    label: 'Sales',
    links: [
      { label: 'Referral Network', href: '/admin/referral-network', description: 'Provider applications and approvals' },
      { label: 'Inquiries',    href: '/admin/ads/inquiries', description: 'Print / Digital / Email leads' },
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
      { label: 'Monthly Articles', href: '/admin/articles', description: 'Multi-market articles & advertiser features' },
    ],
  },
  {
    label: 'Website',
    links: [
      { label: 'Trending',  href: '/admin/content/trending', description: 'Rotating feed ticker CTAs' },
      { label: 'Monthly Articles', href: '/admin/articles', description: 'Multi-market articles & advertiser features' },
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
      { label: 'Social Link Builder', href: '/admin/link-builder', description: 'Tagged links for Facebook & Instagram posts' },
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

/**
 * Get Paid is its own admin area with its own sidebar and login. These groups
 * are shown instead of ADMIN_NAV while the admin is inside Get Paid.
 */
export const GET_PAID_NAV: AdminNavGroup[] = [
  { label: 'Dashboard', links: [{ label: 'Dashboard', href: '/admin/get-paid', description: 'Invoices, agreements, payouts and revenue at a glance' }] },
  {
    label: 'Agreements',
    links: [
      { label: 'Agreements', href: '/admin/agreements/renewals-v2', description: 'One-tap renewals and new-partner agreements' },
      { label: 'Templates', href: '/admin/agreements/templates-beta', description: 'Reusable agreement templates with service billing rules' },
      { label: 'Agreement terms', href: '/admin/get-paid/agreement-terms', description: 'Edit terms with effective dates; signed agreements keep theirs' },
    ],
  },
  {
    label: 'Partners',
    links: [
      { label: 'Partners', href: '/admin/agreements/clients', description: 'Main contact person for each partner' },
      { label: 'Contacts', href: '/admin/agreements/clients/contacts', description: 'Other people inside each partner organization', parent: '/admin/agreements/clients' },
    ],
  },
  {
    label: 'Billing',
    links: [
      { label: 'Billing', href: '/admin/billing-hub', description: 'Agreement, payment methods, invoices and activity for one partner' },
      { label: 'Invoices', href: '/admin/billing-hub/invoices', description: 'Every invoice across all partners', parent: '/admin/billing-hub' },
      { label: 'Payouts', href: '/admin/payouts-beta', description: 'Stripe payouts, fees, transactions and deposit IDs' },
    ],
  },
  {
    label: 'Services',
    links: [
      { label: 'Services', href: '/admin/services-beta', description: 'Services, rates, billing occurrence and trigger' },
      { label: 'Bundles', href: '/admin/services-beta/bundles', description: 'Group services into one priced bundle', parent: '/admin/services-beta' },
    ],
  },
  {
    label: 'Reports',
    links: [
      { label: 'Reports', href: '/admin/reports-beta', description: 'Revenue, active services, future invoices, agreements and credit' },
      { label: 'Deposit Slip', href: '/admin/reports-beta/deposit-slip', description: 'Checks recorded against invoices, totalled for the bank deposit', parent: '/admin/reports-beta' },
    ],
  },
  {
    label: 'Settings',
    links: [
      { label: 'Payment settings', href: '/admin/get-paid/payment-settings', description: 'Checkout options and processing fees' },
      { label: 'Payment options', href: '/admin/integrations-beta/payment-options', description: 'Every payment method available in Stripe' },
      { label: 'Integrations', href: '/admin/integrations-beta', description: 'Stripe, QuickBooks and Gmail status' },
      { label: 'API keys', href: '/admin/integrations-beta/api-keys', description: 'Generate and revoke API keys', parent: '/admin/integrations-beta' },
      { label: 'Business details', href: '/admin/settings-beta/business-details', description: 'Business name, address, brand and billing settings' },
      { label: 'Team', href: '/admin/settings-beta/team', description: 'Invite and manage team members', parent: '/admin/settings-beta/business-details' },
      { label: 'Notifications', href: '/admin/settings-beta/notifications', description: 'Choose which notifications your team and clients receive', parent: '/admin/settings-beta/business-details' },
    ],
  },
];

/** Every admin nav group, for search and quick links. */
export const ALL_ADMIN_NAV: AdminNavGroup[] = [...ADMIN_NAV, ...GET_PAID_NAV];

const GET_PAID_PREFIXES = [
  '/admin/get-paid',
  '/admin/getpaid',
  '/admin/agreements',
  '/admin/billing-hub',
  '/admin/billing',
  '/admin/invoices',
  '/admin/payouts-beta',
  '/admin/services-beta',
  '/admin/reports-beta',
  '/admin/integrations-beta',
  '/admin/settings-beta',
  '/admin/dashboard-beta',
];

/** True when the pathname belongs to the Get Paid admin area. */
export function isGetPaidPath(pathname: string): boolean {
  return GET_PAID_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
