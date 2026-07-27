// app/admin/metrics/_types.ts
// Shared types for the admin metrics dashboard.

export type EventTotal = { event: string; total: number };
export type FilterUsage = { filter: string; total: number };
export type TopBuilder = { builder_name: string; source_page: string; total: number };
export type TopInventory = {
  builder_name: string;
  row_id: string;
  kind: string;
  destination: string;
  total: number;
};
export type TimeSeriesPoint = { day: string; event: string; total: number };

// Back/Share/Download pill engagement, grouped by surface + action.
// `surface` is one of: 'inventory', 'communities', 'builders', 'event',
// 'inventory_detail', 'magazine'. `action` is one of: 'back', 'share',
// 'download', 'add_calendar', 'directions', 'promotions'.
export type PillEngagement = {
  surface: string;
  action: string;
  total: number;
};

export type ShareBreakdown = {
  surface: string;
  channel: string;
  total: number;
};

// 'Request more information' actions from /inventory/[id], grouped by
// builder. Covers link-outs to a builder's community contact form and
// inline-form submissions.
export type ListingInquiry = {
  builder_name: string;
  total: number;
};

export type Metrics = {
  event_totals: EventTotal[];
  filter_usage: FilterUsage[];
  top_builders: TopBuilder[];
  top_inventory: TopInventory[];
  time_series: TimeSeriesPoint[];
  kpi_summary?: KPISummary;
  pill_engagement?: PillEngagement[];
  share_breakdown?: ShareBreakdown[];
  listing_inquiries?: ListingInquiry[];
};

export const EVENT_LABELS: Record<string, string> = {
  inventory_filter_clicked: 'Filter pill clicks',
  builder_chip_clicked: 'Builder chip clicks',
  inventory_card_clicked: 'Inventory card clicks',
  builder_tab_clicked: 'Builder tab clicks',
  // Pill engagement events (added when Back/Share/Download was rolled
  // out across builder, communities, inventory, and event surfaces).
  inventory_back_pill_clicked: 'Inventory — Back',
  inventory_shared: 'Inventory — Share',
  inventory_download_pill_clicked: 'Inventory — Download',
  communities_back_pill_clicked: 'Communities — Back',
  communities_shared: 'Communities — Share',
  communities_download_pill_clicked: 'Communities — Download',
  builder_back_pill_clicked: 'Builder — Back',
  builder_shared: 'Builder — Share',
  builder_download_pill_clicked: 'Builder — Download',
  event_back_pill_clicked: 'Event — Back',
  event_shared: 'Event — Share',
  inventory_floater_clicked: 'Inventory detail — Floater',
  flipbook_shared: 'Magazine — Share',
  flipbook_download_clicked: 'Magazine — Download',
  inventory_inquiry_submitted: 'Listing inquiries (form submits)',
  inventory_request_info_clicked: 'Request-info clicks',
  // Ad slot tracking (paid placements rendered via <AdSlot>)
  ad_impression: 'Ad impressions',
  ad_click: 'Ad clicks',
  // Server-side CRM / lifecycle events (fired from API routes via
  // lib/server/posthog.ts captureServerEvent).
  advertiser_linked: 'CRM — Advertiser linked to agreement',
  advertiser_signed: 'CRM — Advertiser signed agreement',
  agreement_create_failed: 'CRM — Agreement create failed',
  amended_pdf_sent: 'CRM — Amended agreement PDF sent',
  dispatch_failed: 'Email — Dispatch failed',
  email_sent: 'Email — Sent',
  giveaway_entered: 'Giveaway — Entry recorded',
  invoice_create_failed: 'CRM — Invoice create failed',
  issue_charge_failed: 'Billing — Issue charge failed',
  issue_charge_succeeded: 'Billing — Issue charge succeeded',
  locations_staff_seeded: 'CRM — Locations + staff seeded',
  pdf_generation_failed: 'PDF — Generation failed',
  renewal_email_sent: 'CRM — Renewal email sent',
  verify_failed: 'Verify — Failed',
  // Admin API tracking — fired by withAdminTracking wrapper on all
  // POST/PUT/PATCH/DELETE admin API mutations.
  admin_action: 'Admin — API action',
  // Email engagement tracking (from /api/track/open and /api/track/click pixels)
  email_opened: 'Email — Opened (pixel)',
  email_clicked: 'Email — Clicked (pixel)',
  // Standalone public page view tracking
  login_page_viewed: 'Login page — Viewed',
  login_attempted: 'Login — Attempted',
  subscribe_page_viewed: 'Subscribe page — Viewed',
  subscribe_attempted: 'Subscribe — Attempted',
  newsletter_page_viewed: 'Newsletter landing — Viewed',
  giveaway_page_viewed: 'Giveaways page — Viewed',
  advertise_page_viewed: 'Advertise main — Viewed',
  advertise_digital_page_viewed: 'Advertise digital — Viewed',
  advertise_print_page_viewed: 'Advertise print — Viewed',
  advertise_email_page_viewed: 'Advertise e-Blast — Viewed',
  advertise_inquire_page_viewed: 'Advertise inquire — Viewed',
  advertise_placements_page_viewed: 'Advertise placements — Viewed',
  advertise_portal_page_viewed: 'Advertise portal — Viewed',
  advertise_checkout_page_viewed: 'Advertise checkout — Viewed',
  newsletter_signup_attempted: 'Newsletter — Signup attempted',
};

export const SURFACE_LABELS: Record<string, string> = {
  inventory: 'Inventory & Promotions',
  communities: 'New Home Communities',
  builders: 'Builder detail',
  event: 'Event detail',
  inventory_detail: 'Inventory card detail',
  magazine: 'Magazine reader',
};

export const ACTION_LABELS: Record<string, string> = {
  back: 'Back',
  share: 'Share',
  download: 'Download',
  add_calendar: 'Add to calendar',
  directions: 'Directions',
  promotions: 'Promotions',
  register: 'Register',
  save: 'Save',
  contact: 'Contact',
};

// Color palette consistent with the rest of the app:
// #301D5D — admin chrome navy
// #301D5D — RealtyLine pub navy
// #2c0530 — Newsline San Antonio pub navy
// #c2410c — accent blue (links, hover states)
export const EVENT_COLORS: Record<string, string> = {
  inventory_filter_clicked: '#301D5D',
  builder_chip_clicked: '#301D5D',
  inventory_card_clicked: '#2c0530',
  builder_tab_clicked: '#c2410c',
};

export type KPISummary = {
  today: number;
  yesterday: number;
  week: number;
  trend_pct: number;
};
