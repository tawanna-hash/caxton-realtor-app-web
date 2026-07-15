// Server-side data fetch for the publisher dashboard.
// Aggregates per-market counts from the existing tables without touching
// any of the /admin/ads or /admin/crm routes — read-only view.

import { query } from '@/lib/server/db/neon';
import { MARKETS, type Market, MARKET_META } from '@/lib/types/markets';

export interface MarketSnapshot {
  market: Market;
  label: string;
  status: 'live' | 'coming_soon';
  publication: string;
  advertiserCount: number;
  activeCount: number;
  prospectCount: number;
  bounceCount: number;
  opens30d: number;
  activeCampaigns: number;
  revenueMtdCents: number;
  currentIssue: {
    id: number;
    label: string;
    year: number;
    month: number;
  } | null;
}

export interface AttentionItem {
  kind: 'bounce' | 'unsigned_agreement' | 'unpaid_invoice' | 'renewal_due';
  count: number;
  label: string;
  href: string;
}

export interface DashboardData {
  markets: MarketSnapshot[];
  attention: AttentionItem[];
  generatedAt: string;
}

// Map internal Market → the publication string used in ad_campaigns.pubs[]
function marketToPubKey(m: Market): string {
  return MARKET_META[m].publication;
}

// Map internal Market → the publication string used in advertisers/magazines
// (these tables historically use city slugs, not brand slugs)
function marketToCitySlug(m: Market): string {
  return m; // austin | san_antonio | houston | dallas — same slug
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const snapshots: MarketSnapshot[] = [];

  for (const market of MARKETS) {
    const meta = MARKET_META[market];
    const pub = marketToPubKey(market);
    const citySlug = marketToCitySlug(market);

    // Advertiser counts by status. `publication` is the canonical brand slug
    // on advertisers (realtyline / newsline / realtyline-houston / -dallas).
    // Status enum is 'prospect' | 'advertiser' | 'archived'.
    const advRows = await query<{
      status: string | null;
      count: string;
      bounces: string;
      opens: string;
    }>(
      `SELECT
         COALESCE(status, 'unknown') AS status,
         COUNT(*)::text AS count,
         COUNT(*) FILTER (WHERE last_bounced_at IS NOT NULL)::text AS bounces,
         COALESCE(SUM(open_count) FILTER (
           WHERE last_opened_at IS NOT NULL
             AND last_opened_at >= NOW() - INTERVAL '30 days'
         ), 0)::text AS opens
       FROM advertisers
       WHERE publication = $1
       GROUP BY COALESCE(status, 'unknown')`,
      [pub],
    );

    let advertiserCount = 0;
    let activeCount = 0;
    let prospectCount = 0;
    let bounceCount = 0;
    let opens30d = 0;
    for (const r of advRows) {
      const c = Number(r.count) || 0;
      advertiserCount += c;
      if (r.status === 'advertiser') activeCount += c;
      if (r.status === 'prospect') prospectCount += c;
      bounceCount += Number(r.bounces) || 0;
      opens30d += Number(r.opens) || 0;
    }

    // Active ad campaigns (uses pubs[] overlap for multi-market rows)
    const campaignRows = await query<{ count: string; revenue: string }>(
      `SELECT
         COUNT(*)::text AS count,
         COALESCE(SUM(price_total), 0)::text AS revenue
       FROM ad_campaigns
       WHERE active = true
         AND $1 = ANY(pubs)
         AND start_date <= CURRENT_DATE
         AND end_date >= CURRENT_DATE`,
      [pub],
    );
    const activeCampaigns = Number(campaignRows[0]?.count ?? 0);
    // Revenue MTD from invoices (paid this calendar month)
    const revRows = await query<{ revenue: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0)::text AS revenue
       FROM invoices
       WHERE status = 'paid'
         AND paid_at >= DATE_TRUNC('month', NOW())
         AND advertiser_id IN (
           SELECT id FROM advertisers WHERE publication = $1
         )`,
      [pub],
    );
    const revenueMtdCents = Number(revRows[0]?.revenue ?? 0);

    // Current issue (most recent by year/month)
    const issueRows = await query<{
      id: number;
      issue_label: string;
      year: number;
      month: number;
    }>(
      `SELECT id, issue_label, year, month
       FROM magazines
       WHERE publication = $1
       ORDER BY year DESC, month DESC
       LIMIT 1`,
      [citySlug],
    );
    const currentIssue = issueRows[0]
      ? {
          id: issueRows[0].id,
          label: issueRows[0].issue_label,
          year: issueRows[0].year,
          month: issueRows[0].month,
        }
      : null;

    snapshots.push({
      market,
      label: meta.label,
      status: meta.status,
      publication: pub,
      advertiserCount,
      activeCount,
      prospectCount,
      bounceCount,
      opens30d,
      activeCampaigns,
      revenueMtdCents,
      currentIssue,
    });
  }

  // ── Attention strip (whole-account, cross-market) ────────────────────
  const attention: AttentionItem[] = [];

  const bounceTotalRow = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM advertisers WHERE last_bounced_at IS NOT NULL`,
    [],
  );
  const bounceTotal = Number(bounceTotalRow[0]?.count ?? 0);
  if (bounceTotal > 0) {
    attention.push({
      kind: 'bounce',
      count: bounceTotal,
      label: `${bounceTotal} advertiser${bounceTotal === 1 ? '' : 's'} with recent bounce${bounceTotal === 1 ? '' : 's'}`,
      href: '/admin/crm',
    });
  }

  // Best-effort — these tables may not always exist / may have different
  // status enums. Wrap in try/catch so a schema quirk never blanks the page.
  try {
    const unsignedRow = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM agreements WHERE status IN ('draft', 'sent')`,
      [],
    );
    const n = Number(unsignedRow[0]?.count ?? 0);
    if (n > 0) {
      attention.push({
        kind: 'unsigned_agreement',
        count: n,
        label: `${n} unsigned agreement${n === 1 ? '' : 's'}`,
        href: '/admin/agreements',
      });
    }
  } catch {}

  try {
    const unpaidRow = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM invoices WHERE status IN ('sent', 'overdue')`,
      [],
    );
    const n = Number(unpaidRow[0]?.count ?? 0);
    if (n > 0) {
      attention.push({
        kind: 'unpaid_invoice',
        count: n,
        label: `${n} unpaid invoice${n === 1 ? '' : 's'}`,
        href: '/admin/invoices',
      });
    }
  } catch {}

  return {
    markets: snapshots,
    attention,
    generatedAt: new Date().toISOString(),
  };
}
