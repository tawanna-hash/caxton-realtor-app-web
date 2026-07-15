// lib/server/orders-store.ts
//
// Unified "orders" view across ad_campaigns (self-serve digital) +
// agreements (print/email/multi-channel, often Stripe-paid). Both tables
// already carry the `channel` column shipped in PR A — we pull from each
// and normalize into a single row shape for the /admin/ads/orders pipeline
// at PR E.
//
// We deliberately keep this layer thin and read-only: each underlying
// table keeps its own mutation surface (campaign detail at
// /admin/ads/campaigns/[id], Billing for agreements). The orders page
// shows them together and links out — it does not re-implement edits.

import { getSql } from '@/lib/db';
import type { AdChannel } from '@/lib/ad-channels';

export type OrderSource = 'campaign' | 'agreement';

export type OrderStatus =
  | 'draft'
  | 'sent'
  | 'signed'
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'paid'
  // Campaigns have a boolean `active` — we project to 'active' | 'cancelled'
  // so the pipeline view can render them with the same vocabulary.
  ;

export interface OrderRow {
  id: string;
  source: OrderSource;
  channel: AdChannel;
  status: OrderStatus;
  advertiser_id: number | null;
  advertiser_name: string | null;
  advertiser_email: string | null;
  /** Digital → slot slug. Print → ad_size. Email → eblast package name. */
  slot_or_size: string | null;
  publication: string | null;
  start_date: string | null;
  end_date: string | null;
  amount_cents: number | null;
  stripe_payment_link_url: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface ListOrdersParams {
  channel?: AdChannel;
  source?: OrderSource;
  status?: OrderStatus;
  q?: string;
  limit?: number;
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
  price_total: string | null;
  created_at: string;
}

interface AgreementRow {
  id: string;
  channel: string;
  advertiser_id: number | null;
  company_name: string | null;
  advertiser_email: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  ad_size: string | null;
  amount_cents: number | null;
  stripe_payment_link_url: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
  publication: string | null;
}

function asChannel(v: unknown): AdChannel {
  return v === 'print' || v === 'email' ? v : 'digital';
}

export async function listOrders(
  params: ListOrdersParams = {},
): Promise<OrderRow[]> {
  const sql = getSql();
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const channel = params.channel ?? null;
  const source = params.source ?? null;
  const q = params.q ? `%${params.q.toLowerCase()}%` : null;

  const rows: OrderRow[] = [];

  // ─── ad_campaigns (digital self-serve) ─────────────────────────────────
  if (source !== 'agreement') {
    const campaigns = (await sql`
      SELECT id, channel, advertiser_name, ad_space_slug, publication,
             start_date, end_date, active, price_total, created_at
        FROM ad_campaigns
       WHERE (${channel}::text IS NULL OR channel = ${channel})
         AND (${q}::text       IS NULL OR
              lower(advertiser_name) LIKE ${q} OR
              lower(ad_space_slug)   LIKE ${q})
       ORDER BY created_at DESC
       LIMIT ${limit}
    `) as unknown as CampaignRow[];

    for (const c of campaigns) {
      const priceCents =
        c.price_total != null ? Math.round(Number(c.price_total) * 100) : null;
      rows.push({
        id: c.id,
        source: 'campaign',
        channel: asChannel(c.channel),
        status: c.active ? 'active' : 'cancelled',
        advertiser_id: null,
        advertiser_name: c.advertiser_name,
        advertiser_email: null,
        slot_or_size: c.ad_space_slug,
        publication: c.publication,
        start_date: c.start_date,
        end_date: c.end_date,
        amount_cents: priceCents,
        stripe_payment_link_url: null,
        stripe_payment_intent_id: null,
        paid_at: null,
        created_at: c.created_at,
      });
    }
  }

  // ─── agreements (print/email/multi-channel) ────────────────────────────
  if (source !== 'campaign') {
    const agreements = (await sql`
      SELECT id, channel, advertiser_id, company_name, advertiser_email,
             status, start_date, end_date, ad_size, amount_cents,
             stripe_payment_link_url, stripe_payment_intent_id,
             paid_at, created_at, publication
        FROM agreements
       WHERE (${channel}::text IS NULL OR channel = ${channel})
         AND (${q}::text       IS NULL OR
              lower(company_name)     LIKE ${q} OR
              lower(advertiser_email) LIKE ${q} OR
              lower(ad_size)          LIKE ${q})
       ORDER BY created_at DESC
       LIMIT ${limit}
    `) as unknown as AgreementRow[];

    for (const a of agreements) {
      rows.push({
        id: a.id,
        source: 'agreement',
        channel: asChannel(a.channel),
        status: (a.paid_at ? 'paid' : a.status) as OrderStatus,
        advertiser_id: a.advertiser_id,
        advertiser_name: a.company_name,
        advertiser_email: a.advertiser_email,
        slot_or_size: a.ad_size,
        publication: a.publication,
        start_date: a.start_date,
        end_date: a.end_date,
        amount_cents: a.amount_cents,
        stripe_payment_link_url: a.stripe_payment_link_url,
        stripe_payment_intent_id: a.stripe_payment_intent_id,
        paid_at: a.paid_at,
        created_at: a.created_at,
      });
    }
  }

  // Filter by status post-union since the projection differs by source.
  const statusFiltered = params.status
    ? rows.filter((r) => r.status === params.status)
    : rows;

  // Sort by created_at DESC across both sources.
  statusFiltered.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );

  return statusFiltered.slice(0, limit);
}

export async function countOrdersByChannel(): Promise<Record<AdChannel | 'all', number>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT channel, count(*)::int AS n
      FROM (
        SELECT channel FROM ad_campaigns
        UNION ALL
        SELECT channel FROM agreements
      ) u
     GROUP BY channel
  `) as unknown as { channel: string; n: number }[];

  const out: Record<AdChannel | 'all', number> = {
    all: 0,
    print: 0,
    digital: 0,
    email: 0,
    app: 0,
  };
  for (const r of rows) {
    const c = asChannel(r.channel);
    out[c] += r.n;
    out.all += r.n;
  }
  return out;
}
