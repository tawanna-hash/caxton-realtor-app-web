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

export type Metrics = {
  event_totals: EventTotal[];
  filter_usage: FilterUsage[];
  top_builders: TopBuilder[];
  top_inventory: TopInventory[];
  time_series: TimeSeriesPoint[];
  kpi_summary?: KPISummary;
};

export const EVENT_LABELS: Record<string, string> = {
  inventory_filter_clicked: 'Filter pill clicks',
  builder_chip_clicked: 'Builder chip clicks',
  inventory_card_clicked: 'Inventory card clicks',
  builder_tab_clicked: 'Builder tab clicks',
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
