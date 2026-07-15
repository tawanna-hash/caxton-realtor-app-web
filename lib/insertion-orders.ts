// lib/insertion-orders.ts
//
// Shared types + constants for insertion orders. Kept out of
// lib/server/* so client components can import the types without
// pulling in server-only db code.

import type { AdChannel } from './ad-channels';

export const IO_STATUS_VALUES = [
  'draft',
  'sent',
  'acknowledged',
  'active',
  'fulfilled',
  'cancelled',
] as const;
export type IoStatus = (typeof IO_STATUS_VALUES)[number];

export const IO_STATUS_LABEL: Record<IoStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  acknowledged: 'Acknowledged',
  active: 'Active',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};

export interface IoLineItem {
  // Free-form so callers can describe print / digital / email / app
  // line items with the fields that make sense for each.
  slot?: string;         // ad_space_slug or 'brand-1x' etc.
  size?: string;         // e.g. '1/2 page', '728x90'
  description?: string;
  quantity?: number;
  rate_cents?: number;
  total_cents?: number;
  // Per-line dates (optional — most IOs use the top-level flight_*)
  start_date?: string | null;
  end_date?: string | null;
  notes?: string;
}

export interface InsertionOrder {
  id: string;
  io_number: string;
  agreement_id: string | null;
  advertiser_id: number | null;
  campaign_ids: string[];
  channel: AdChannel;
  publication: string | null;
  flight_start: string | null;
  flight_end: string | null;
  line_items: IoLineItem[];
  total_cents: number;
  status: IoStatus;
  notes: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertionOrderWithAdvertiser extends InsertionOrder {
  advertiser_name: string | null;
  advertiser_email: string | null;
}

// ─── Tearsheets ──────────────────────────────────────────────
export const TEARSHEET_STATUS_VALUES = ['pending', 'ready', 'sent'] as const;
export type TearsheetStatus = (typeof TEARSHEET_STATUS_VALUES)[number];

export const TEARSHEET_STATUS_LABEL: Record<TearsheetStatus, string> = {
  pending: 'Pending',
  ready: 'Ready',
  sent: 'Sent',
};

export interface Tearsheet {
  id: string;
  io_id: string | null;
  campaign_id: string | null;
  advertiser_id: number | null;
  channel: AdChannel;
  publication: string | null;
  issue_date: string | null;
  issue_label: string | null;
  file_url: string | null;
  file_type: string | null;
  status: TearsheetStatus;
  sent_to: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TearsheetWithAdvertiser extends Tearsheet {
  advertiser_name: string | null;
  advertiser_email: string | null;
  io_number: string | null;
}
