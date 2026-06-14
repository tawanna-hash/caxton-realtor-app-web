// lib/server/availability-store.ts
//
// Read-only feed for the /admin/ads/availability calendar (PR F).
//
// Returns "booked windows" across all three channels in a single normalized
// shape so the calendar UI can render print issue months, digital slot
// windows, and email send dates on the same grid.
//
//   - Digital  → ad_campaigns rows (channel='digital'), one entry per
//                booking, dated start_date..end_date. Self-serve checkout
//                writes here.
//   - Print    → agreements rows (channel='print'), dated start_date..
//                end_date covering the issue months. Admin quote flow
//                (PR C) writes here once an invoice is paid/signed.
//   - Email    → agreements rows (channel='email'). Same shape as print
//                but treated as point dates by the UI (start_date is the
//                send date).
//
// We deliberately keep agreements vs campaigns split here — the calendar
// surfaces the distinction (admin can click through to /admin/billing vs
// /admin/ads/campaigns/[id]).

import { getSql } from '@/lib/db';
import type { AdChannel } from '@/lib/ad-channels';

export type AvailabilitySource = 'campaign' | 'agreement';

export interface BookedWindow {
  /** Stable row id (uuid for campaigns, uuid for agreements). */
  id: string;
  source: AvailabilitySource;
  channel: AdChannel;
  /** Digital → slot slug. Print → ad_size (e.g. "Full Page"). Email → package name. */
  slot_or_size: string | null;
  /** 'austin' | 'san_antonio' | 'both' | 'realtyline' | 'newsline' | null. */
  publication: string | null;
  advertiser_name: string | null;
  start_date: string; // ISO YYYY-MM-DD
  end_date: string;   // ISO YYYY-MM-DD (inclusive; for email = start_date)
  status: string;     // raw status from source table
}

export interface ListBookedParams {
  channel?: AdChannel;
  /** Filter window. Inclusive. Defaults to the next 13 months from today. */
  rangeStart?: string;
  rangeEnd?: string;
}

interface CampaignRow {
  id: string;
  channel: string;
  advertiser_name: string | null;
  ad_space_slug: string | null;
  publication: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
}

interface AgreementRow {
  id: string;
  channel: string;
  company_name: string | null;
  ad_size: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  paid_at: string | null;
}

function defaultRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 13, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function asChannel(v: unknown): AdChannel {
  return v === 'print' || v === 'email' ? v : 'digital';
}

/**
 * List booked windows across ad_campaigns + agreements within a date range,
 * normalized for the availability calendar.
 *
 * Fails open: if the DB is unreachable (sandbox build without DATABASE_URL),
 * returns an empty array rather than throwing, so the page still renders
 * an empty calendar instead of a 500.
 */
export async function listBookedWindows(
  params: ListBookedParams = {},
): Promise<BookedWindow[]> {
  const range = (() => {
    if (params.rangeStart && params.rangeEnd) {
      return { start: params.rangeStart, end: params.rangeEnd };
    }
    return defaultRange();
  })();

  const channel = params.channel ?? null;
  const out: BookedWindow[] = [];

  try {
    const sql = getSql();

    // ─── Digital (ad_campaigns) ────────────────────────────────────────
    if (channel === null || channel === 'digital') {
      const rows = (await sql`
        SELECT id, channel, advertiser_name, ad_space_slug, publication,
               start_date::text AS start_date, end_date::text AS end_date,
               active
          FROM ad_campaigns
         WHERE channel = 'digital'
           AND start_date <= ${range.end}::date
           AND end_date   >= ${range.start}::date
         ORDER BY start_date ASC
      `) as unknown as CampaignRow[];

      for (const r of rows) {
        if (!r.start_date || !r.end_date) continue;
        out.push({
          id: r.id,
          source: 'campaign',
          channel: 'digital',
          slot_or_size: r.ad_space_slug,
          publication: r.publication,
          advertiser_name: r.advertiser_name,
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.active ? 'active' : 'cancelled',
        });
      }
    }

    // ─── Print + Email (agreements) ────────────────────────────────────
    if (channel === null || channel === 'print' || channel === 'email') {
      const channelFilter = channel ?? null;
      const rows = (await sql`
        SELECT id, channel, company_name, ad_size, status,
               start_date::text AS start_date, end_date::text AS end_date,
               paid_at::text AS paid_at
          FROM agreements
         WHERE channel IN ('print', 'email')
           AND (${channelFilter}::text IS NULL OR channel = ${channelFilter})
           AND start_date IS NOT NULL
           AND end_date   IS NOT NULL
           AND start_date <= ${range.end}::date
           AND end_date   >= ${range.start}::date
         ORDER BY start_date ASC
      `) as unknown as AgreementRow[];

      for (const r of rows) {
        if (!r.start_date || !r.end_date) continue;
        out.push({
          id: r.id,
          source: 'agreement',
          channel: asChannel(r.channel),
          slot_or_size: r.ad_size,
          publication: null,
          advertiser_name: r.company_name,
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.paid_at ? 'paid' : r.status,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[availability-store] fail-open: ${msg}`);
    return [];
  }

  return out;
}
