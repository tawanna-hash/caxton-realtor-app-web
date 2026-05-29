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

export type Metrics = {
  event_totals: EventTotal[];
  filter_usage: FilterUsage[];
  top_builders: TopBuilder[];
  top_inventory: TopInventory[];
  time_series: TimeSeriesPoint[];
  kpi_summary?: KPISummary;
  pill_engagement?: PillEngagement[];
  share_breakdown?: ShareBreakdown[];
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
  // Ad slot tracking (paid placements rendered via <AdSlot>)
  ad_impression: 'Ad impressions',
  ad_click: 'Ad clicks',
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
};

// Color palette consistent with the rest of the app:
// #1a2a44 — admin chrome navy
// #021D40 — RealtyLine pub navy
// #2d1a44 — Newsline pub navy
// #185FA5 — accent blue (links, hover states)
export const EVENT_COLORS: Record<string, string> = {
  inventory_filter_clicked: '#1a2a44',
  builder_chip_clicked: '#021D40',
  inventory_card_clicked: '#2d1a44',
  builder_tab_clicked: '#185FA5',
};

export type KPISummary = {
  today: number;
  yesterday: number;
  week: number;
  trend_pct: number;
};
