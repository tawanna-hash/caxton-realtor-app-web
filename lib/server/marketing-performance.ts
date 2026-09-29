// lib/server/marketing-performance.ts
//
// Real-data rollup for /admin/marketing-performance.
//
// Every number is derived from existing production sources — nothing is
// sampled or estimated:
//
//   Impressions  PostHog `$pageview` count by session channel, plus delivered
//                campaign emails (marketing_campaign_outreach_recipients) on
//                the Email channel.
//   Sessions     PostHog unique `$session_id` by `session.$channel_type`.
//   MQLs         ad_inquiries (advertiser leads) by created_at.
//   SQLs         agreements that reached proposal_sent or later, by created_at.
//   Conversions  agreements with signed_at, by signed_at.
//   Revenue      invoices with status = 'paid', by paid_at (same rule as the
//                Admin Dashboard revenue tile).
//   Spend        marketing_spend (manual monthly entries per channel).
//
// Channel attribution for leads / agreements / revenue:
//   1. Email  — the advertiser (or inquiry email) clicked a campaign email in
//               the 90 days before the record.
//   2. UTM    — utm_medium / utm_source on the inquiry's source_url.
//   3. Direct — nothing else is known (same convention as GA/PostHog).
//
// Months are bucketed in America/Chicago.

import { query } from '@/lib/server/db/neon';
import { fetchGa4Monthly, getGa4Connection, isGa4OAuthConfigured } from '@/lib/server/ga4-client';
import { fetchMailchimpSummary, isMailchimpConfigured, type MailchimpMonth } from '@/lib/server/mailchimp';

export const CHANNELS = ['organic', 'paid', 'social', 'email', 'direct'] as const;
export type Channel = (typeof CHANNELS)[number];

export const MONTHS_BACK = 24;
const TZ = 'America/Chicago';
const POSTHOG_HOST = 'https://us.posthog.com';

export interface ChannelMonthRow {
  month: string; // YYYY-MM
  channel: Channel;
  impressions: number;
  sessions: number;
  mqls: number;
  sqls: number;
  conversions: number;
  revenue_cents: number;
  spend_cents: number;
  /** PostHog pageviews (already included in impressions). */
  pageviews: number;
  /** GA4 sessions / pageviews / key events for the same month × channel. */
  ga4_sessions: number;
  ga4_pageviews: number;
  ga4_key_events: number;
  /** Mailchimp delivered emails (already included in Email impressions). */
  mc_delivered: number;
}

export interface SourceStatus {
  posthog: { connected: boolean };
  ga4: { configured: boolean; connected: boolean; email: string | null; propertyId: string | null; propertyName: string | null; error: string | null };
  mailchimp: { configured: boolean; connected: boolean; accountName: string | null; error: string | null };
}

export interface SpendEntry {
  id: string;
  month: string;
  channel: Channel;
  amount_cents: number;
  notes: string | null;
  updated_at: string;
}

export interface MarketingPerformance {
  asOf: string;
  months: string[];
  rows: ChannelMonthRow[];
  spend: SpendEntry[];
  firstTrafficMonth: string | null;
  firstGa4Month: string | null;
  mailchimp: MailchimpMonth[];
  sources: SourceStatus;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Schema (additive only)
// ---------------------------------------------------------------------------

let spendSchemaReady: Promise<void> | null = null;

export function ensureMarketingSpendSchema(): Promise<void> {
  if (!spendSchemaReady) {
    spendSchemaReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS marketing_spend (
          id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          month        date NOT NULL,
          channel      text NOT NULL CHECK (channel IN ('organic','paid','social','email','direct')),
          amount_cents integer NOT NULL CHECK (amount_cents >= 0),
          notes        text,
          created_by   text,
          created_at   timestamptz NOT NULL DEFAULT now(),
          updated_at   timestamptz NOT NULL DEFAULT now(),
          UNIQUE (month, channel)
        )
      `);
    })().catch((err) => {
      spendSchemaReady = null;
      throw err;
    });
  }
  return spendSchemaReady;
}

// ---------------------------------------------------------------------------
// Channel mapping
// ---------------------------------------------------------------------------

/** PostHog `session.$channel_type` → dashboard channel. */
export function channelFromPosthog(type: string | null | undefined): Channel {
  const t = (type ?? '').toLowerCase();
  if (!t || t === 'direct' || t === 'unknown' || t === 'unassigned' || t === 'push' || t === 'sms' || t === 'mobile push notifications') return 'direct';
  if (t === 'email') return 'email';
  if (t === 'organic social') return 'social';
  if (t.startsWith('paid') || t === 'display' || t === 'cross network' || t === 'cross-network' || t === 'affiliate' || t === 'affiliates' || t === 'audio') return 'paid';
  // Organic Search / Video / Shopping, Referral, AI
  return 'organic';
}

/** utm_medium / utm_source → channel, or null when no UTM signal. */
export function channelFromUtm(medium: string | null, source: string | null): Channel | null {
  const m = decodeSafe(medium).toLowerCase();
  const s = decodeSafe(source).toLowerCase();
  if (!m && !s) return null;
  if (/(cpc|ppc|paid|display|banner|cpm|retarget|sponsored)/.test(m)) return 'paid';
  if (/(e-?mail|newsletter|eblast)/.test(m) || /(e-?mail|newsletter|eblast|resend)/.test(s)) return 'email';
  if (/social/.test(m) || /(facebook|instagram|linkedin|twitter|x\.com|tiktok|youtube|threads|fb|ig)/.test(s)) return 'social';
  if (/(organic|seo|referral)/.test(m) || /(google|bing|yahoo|duckduckgo)/.test(s)) return 'organic';
  return null;
}

function decodeSafe(v: string | null): string {
  if (!v) return '';
  try { return decodeURIComponent(v.replace(/\+/g, ' ')); } catch { return v; }
}

function monthKeys(): string[] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const out: string[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PostHog
// ---------------------------------------------------------------------------

async function runHogQL(name: string, sql: string): Promise<Array<Array<string | number | null>>> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID || '418339';
  if (!key) throw new Error('POSTHOG_PERSONAL_API_KEY is not set');
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql }, name }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PostHog ${res.status} on "${name}": ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { results?: Array<Array<string | number | null>> };
  return body.results ?? [];
}

async function fetchTraffic(): Promise<Array<{ month: string; type: string; sessions: number; pageviews: number }>> {
  const rows = await runHogQL(
    'marketing_performance.traffic',
    `
    SELECT
      formatDateTime(toStartOfMonth(toTimeZone(timestamp, '${TZ}')), '%Y-%m') AS month,
      session.$channel_type AS channel_type,
      uniq(properties.$session_id) AS sessions,
      count() AS pageviews
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${MONTHS_BACK} MONTH
      AND (properties.$pathname IS NULL OR NOT startsWith(properties.$pathname, '/admin'))
    GROUP BY month, channel_type
    ORDER BY month
    `,
  );
  return rows.map((r) => ({
    month: String(r[0]),
    type: String(r[1] ?? ''),
    sessions: Number(r[2]) || 0,
    pageviews: Number(r[3]) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Neon
// ---------------------------------------------------------------------------

const MONTH_EXPR = (col: string) => `to_char(date_trunc('month', ${col} AT TIME ZONE '${TZ}'), 'YYYY-MM')`;

// Advertiser clicked a campaign email in the 90 days before `tsCol`.
const ADVERTISER_EMAIL_CLICK = (advCol: string, tsCol: string) => `
  EXISTS (
    SELECT 1 FROM marketing_campaign_outreach_recipients r
     WHERE r.recipient_type = 'advertiser'
       AND r.recipient_id = ${advCol}
       AND r.clicked_at IS NOT NULL
       AND r.clicked_at <= ${tsCol}
       AND r.clicked_at >= ${tsCol} - INTERVAL '90 days'
  )`;

// Latest inquiry UTM for an advertiser before `tsCol`.
const ADVERTISER_UTM = (advCol: string, tsCol: string) => `
  LEFT JOIN LATERAL (
    SELECT substring(i.source_url from '[?&]utm_medium=([^&#]+)') AS utm_medium,
           substring(i.source_url from '[?&]utm_source=([^&#]+)') AS utm_source
      FROM ad_inquiries i
     WHERE i.advertiser_id = ${advCol}
       AND i.created_at <= ${tsCol}
       AND i.source_url ILIKE '%utm_%'
     ORDER BY i.created_at DESC
     LIMIT 1
  ) utm ON true`;

type AttribRow = { month: string; email_click: boolean; utm_medium: string | null; utm_source: string | null };

function attribute(r: AttribRow): Channel {
  if (r.email_click) return 'email';
  return channelFromUtm(r.utm_medium, r.utm_source) ?? 'direct';
}

async function fetchInquiries(since: string) {
  return query<AttribRow>(
    `SELECT ${MONTH_EXPR('i.created_at')} AS month,
            (EXISTS (
               SELECT 1 FROM marketing_campaign_outreach_recipients r
                WHERE lower(r.email) = lower(i.email)
                  AND r.clicked_at IS NOT NULL
                  AND r.clicked_at <= i.created_at
                  AND r.clicked_at >= i.created_at - INTERVAL '90 days'
             )
             OR (i.advertiser_id IS NOT NULL AND ${ADVERTISER_EMAIL_CLICK('i.advertiser_id', 'i.created_at')})
            ) AS email_click,
            substring(i.source_url from '[?&]utm_medium=([^&#]+)') AS utm_medium,
            substring(i.source_url from '[?&]utm_source=([^&#]+)') AS utm_source
       FROM ad_inquiries i
      WHERE i.created_at >= $1::date`,
    [since],
  );
}

async function fetchQualified(since: string) {
  return query<AttribRow>(
    `SELECT ${MONTH_EXPR('a.created_at')} AS month,
            (a.advertiser_id IS NOT NULL AND ${ADVERTISER_EMAIL_CLICK('a.advertiser_id', 'a.created_at')}) AS email_click,
            utm.utm_medium, utm.utm_source
       FROM agreements a
       ${ADVERTISER_UTM('a.advertiser_id', 'a.created_at')}
      WHERE a.created_at >= $1::date
        AND a.status IN ('proposal_sent','proposal_approved','sent','signed','active','expired')`,
    [since],
  );
}

async function fetchSigned(since: string) {
  return query<AttribRow>(
    `SELECT ${MONTH_EXPR('a.signed_at')} AS month,
            (a.advertiser_id IS NOT NULL AND ${ADVERTISER_EMAIL_CLICK('a.advertiser_id', 'a.signed_at')}) AS email_click,
            utm.utm_medium, utm.utm_source
       FROM agreements a
       ${ADVERTISER_UTM('a.advertiser_id', 'a.signed_at')}
      WHERE a.signed_at IS NOT NULL
        AND a.signed_at >= $1::date
        AND a.status <> 'cancelled'`,
    [since],
  );
}

async function fetchRevenue(since: string) {
  return query<AttribRow & { amount_cents: string }>(
    `SELECT ${MONTH_EXPR('v.paid_at')} AS month,
            ${ADVERTISER_EMAIL_CLICK('v.advertiser_id', 'v.paid_at')} AS email_click,
            utm.utm_medium, utm.utm_source,
            v.amount_cents::text AS amount_cents
       FROM invoices v
       ${ADVERTISER_UTM('v.advertiser_id', 'v.paid_at')}
      WHERE v.status = 'paid'
        AND v.paid_at IS NOT NULL
        AND v.paid_at >= $1::date`,
    [since],
  );
}

async function fetchEmailDelivered(since: string) {
  return query<{ month: string; delivered: string }>(
    `SELECT ${MONTH_EXPR('r.sent_at')} AS month, COUNT(*)::text AS delivered
       FROM marketing_campaign_outreach_recipients r
      WHERE r.sent_at IS NOT NULL
        AND r.sent_at >= $1::date
        AND r.status = 'sent'
      GROUP BY 1`,
    [since],
  );
}

export async function fetchSpendEntries(since?: string): Promise<SpendEntry[]> {
  await ensureMarketingSpendSchema();
  const rows = await query<{ id: string; month: string; channel: Channel; amount_cents: number; notes: string | null; updated_at: string }>(
    `SELECT id, to_char(month, 'YYYY-MM') AS month, channel, amount_cents, notes, updated_at::text
       FROM marketing_spend
      WHERE ($1::date IS NULL OR month >= $1::date)
      ORDER BY month DESC, channel`,
    [since ?? null],
  );
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function buildMarketingPerformance(): Promise<MarketingPerformance> {
  const months = monthKeys();
  const since = `${months[0]}-01`;
  const warnings: string[] = [];

  const grid = new Map<string, ChannelMonthRow>();
  for (const month of months) {
    for (const channel of CHANNELS) {
      grid.set(`${month}|${channel}`, {
        month, channel, impressions: 0, sessions: 0, mqls: 0, sqls: 0, conversions: 0, revenue_cents: 0, spend_cents: 0,
        pageviews: 0, ga4_sessions: 0, ga4_pageviews: 0, ga4_key_events: 0, mc_delivered: 0,
      });
    }
  }
  const cell = (month: string, channel: Channel) => grid.get(`${month}|${channel}`);

  const settle = async <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p; } catch (err) {
      console.warn(`[marketing-performance] ${label} failed`, err);
      warnings.push(`${label} could not be loaded: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  };

  const sources: SourceStatus = {
    posthog: { connected: Boolean(process.env.POSTHOG_PERSONAL_API_KEY) },
    ga4: { configured: isGa4OAuthConfigured(), connected: false, email: null, propertyId: null, propertyName: null, error: null },
    mailchimp: { configured: isMailchimpConfigured(), connected: false, accountName: null, error: null },
  };

  const ga4Promise = (async () => {
    try {
      const conn = await getGa4Connection();
      if (!conn) return null;
      sources.ga4 = { ...sources.ga4, connected: true, email: conn.emailAddress, propertyId: conn.propertyId, propertyName: conn.propertyName };
      if (!conn.propertyId) return null;
      return await fetchGa4Monthly(since);
    } catch (err) {
      sources.ga4.error = err instanceof Error ? err.message : String(err);
      return null;
    }
  })();
  const mcPromise = (async () => {
    if (!sources.mailchimp.configured) return null;
    try {
      const summary = await fetchMailchimpSummary(`${since}T00:00:00+00:00`);
      sources.mailchimp = { ...sources.mailchimp, connected: true, accountName: summary.accountName };
      return summary;
    } catch (err) {
      sources.mailchimp.error = err instanceof Error ? err.message : String(err);
      return null;
    }
  })();

  const [ga4, mailchimp] = await Promise.all([ga4Promise, mcPromise]);

  const [traffic, inquiries, qualified, signed, revenue, delivered, spend] = await Promise.all([
    settle('PostHog traffic', fetchTraffic(), []),
    settle('Ad inquiries', fetchInquiries(since), []),
    settle('Agreements (qualified)', fetchQualified(since), []),
    settle('Agreements (signed)', fetchSigned(since), []),
    settle('Paid invoices', fetchRevenue(since), []),
    settle('Email deliveries', fetchEmailDelivered(since), []),
    settle('Marketing spend', fetchSpendEntries(since), [] as SpendEntry[]),
  ]);

  let firstTrafficMonth: string | null = null;
  for (const t of traffic) {
    const c = cell(t.month, channelFromPosthog(t.type));
    if (!c) continue;
    c.sessions += t.sessions;
    c.impressions += t.pageviews;
    c.pageviews += t.pageviews;
    if (t.sessions > 0 && (!firstTrafficMonth || t.month < firstTrafficMonth)) firstTrafficMonth = t.month;
  }
  for (const d of delivered) {
    const c = cell(d.month, 'email');
    if (c) c.impressions += Number(d.delivered) || 0;
  }
  let firstGa4Month: string | null = null;
  for (const g of ga4?.rows ?? []) {
    const c = cell(g.month, channelFromPosthog(g.channelGroup));
    if (!c) continue;
    c.ga4_sessions += g.sessions;
    c.ga4_pageviews += g.pageviews;
    c.ga4_key_events += g.keyEvents;
    if (g.sessions > 0 && (!firstGa4Month || g.month < firstGa4Month)) firstGa4Month = g.month;
  }
  for (const m of mailchimp?.months ?? []) {
    const c = cell(m.month, 'email');
    if (!c) continue;
    c.mc_delivered += m.delivered;
    c.impressions += m.delivered;
  }
  for (const r of inquiries) { const c = cell(r.month, attribute(r)); if (c) c.mqls += 1; }
  for (const r of qualified) { const c = cell(r.month, attribute(r)); if (c) c.sqls += 1; }
  for (const r of signed) { const c = cell(r.month, attribute(r)); if (c) c.conversions += 1; }
  for (const r of revenue) {
    const c = cell(r.month, attribute(r));
    if (c) c.revenue_cents += Number(r.amount_cents) || 0;
  }
  for (const s of spend) {
    const c = cell(s.month, s.channel);
    if (c) c.spend_cents += s.amount_cents;
  }

  return {
    asOf: new Date().toISOString(),
    months,
    rows: Array.from(grid.values()),
    spend,
    firstTrafficMonth,
    firstGa4Month,
    mailchimp: (mailchimp?.months ?? []).filter((m) => months.includes(m.month)),
    sources,
    warnings,
  };
}
