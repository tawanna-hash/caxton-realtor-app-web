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
import { logger } from '@/lib/server/logger';
import { fetchGa4Monthly, getGa4Connection, isGa4OAuthConfigured } from '@/lib/server/ga4-client';
import { fetchMailchimpSummary, isMailchimpConfigured, type MailchimpMonth } from '@/lib/server/mailchimp';

// ---------------------------------------------------------------------------
// Publication scoping
// ---------------------------------------------------------------------------
//
// Every source is tagged with a publication bucket so the dashboard can be
// filtered:
//   austin       RealtyLine Austin
//   san_antonio  Newsline San Antonio
//   other        shared / unassigned (realtynewsnow.app traffic, 'both',
//                Houston/Dallas, records with no publication)
//
// Tagging rules per source:
//   Inquiries / agreements / invoices  record publication, falling back to the
//                                      advertiser's publication
//   Campaign email (in-app composer)   marketing_campaigns.publication
//   Mailchimp                          audience (list) id → publication
//   PostHog                            hostname (newslinesa.com, myrealtyline.com …)
//   GA4                                property name
//   Spend                              marketing_spend.publication ('all' = shared)

export const PUB_BUCKETS = ['austin', 'san_antonio', 'other'] as const;
export type PubBucket = (typeof PUB_BUCKETS)[number];
export const PUB_FILTERS = ['all', ...PUB_BUCKETS] as const;
export type PubFilter = (typeof PUB_FILTERS)[number];

export function isPubFilter(v: unknown): v is PubFilter {
  return typeof v === 'string' && (PUB_FILTERS as readonly string[]).includes(v);
}

/** Normalize any stored publication value (ids, pub keys, labels) to a bucket. */
export function pubBucket(v: string | null | undefined): PubBucket {
  const t = (v ?? '').trim().toLowerCase();
  if (t === 'austin' || t === 'realtyline' || t === 'realtyline-austin' || t === 'realtyline austin') return 'austin';
  if (t === 'san_antonio' || t === 'san-antonio' || t === 'newsline' || t === 'newsline-san-antonio' || t === 'newsline san antonio') return 'san_antonio';
  return 'other';
}

/** Mailchimp audience ids. Override with env if the audiences change. */
function audienceBucket(listId: string): PubBucket {
  const sa = process.env.MAILCHIMP_AUDIENCE_SAN_ANTONIO || '50e6ea3e6f';
  const atx = process.env.MAILCHIMP_AUDIENCE_AUSTIN || '51f88db9d0';
  if (listId && listId === sa) return 'san_antonio';
  if (listId && listId === atx) return 'austin';
  return 'other';
}

function hostBucket(host: string | null | undefined): PubBucket {
  const h = (host ?? '').toLowerCase();
  if (h.includes('newslinesa')) return 'san_antonio';
  if (h.includes('realtyline')) return 'austin';
  return 'other';
}

function propertyBucket(name: string | null | undefined): PubBucket {
  const n = (name ?? '').toLowerCase();
  if (n.includes('newsline') || n.includes('san antonio')) return 'san_antonio';
  if (n.includes('realtyline')) return 'austin';
  return 'other';
}

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
  /** 'all' = shared across publications. */
  publication: 'all' | PubBucket;
}

export interface MarketingPerformance {
  publication: PubFilter;
  asOf: string;
  months: string[];
  rows: ChannelMonthRow[];
  spend: SpendEntry[];
  firstTrafficMonth: string | null;
  firstGa4Month: string | null;
  mailchimp: MailchimpMonth[];
  /** Mailchimp delivered/sent by publication (unfiltered), for the connection card. */
  mailchimpByPublication: Record<PubBucket, MailchimpMonth[]>;
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
          publication  text NOT NULL DEFAULT 'all'
        )
      `);
      // Publication-scoped spend: replace the old (month, channel) uniqueness.
      await query(`ALTER TABLE marketing_spend ADD COLUMN IF NOT EXISTS publication text NOT NULL DEFAULT 'all'`);
      await query(`ALTER TABLE marketing_spend DROP CONSTRAINT IF EXISTS marketing_spend_month_channel_key`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS marketing_spend_month_channel_pub_key ON marketing_spend (month, channel, publication)`);
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
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql, modifiers: { convertToProjectTimezone: false } }, name }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PostHog ${res.status} on "${name}": ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { results?: Array<Array<string | number | null>> };
  return body.results ?? [];
}

async function fetchTraffic(): Promise<Array<{ month: string; type: string; host: string; sessions: number; pageviews: number }>> {
  try {
    return await fetchTrafficFromEvents();
  } catch (err) {
    // PostHog's events table can fail server-side (e.g. "decimal_overflow")
    // while the sessions table still works. Fall back to session-level
    // counts; sessions that start in /admin are excluded.
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[marketing-performance] events query failed; using sessions table');
    return fetchTrafficFromSessions();
  }
}

async function fetchTrafficFromSessions(): Promise<Array<{ month: string; type: string; host: string; sessions: number; pageviews: number }>> {
  const rows = await runHogQL(
    'marketing_performance.traffic_sessions',
    `
    SELECT
      formatDateTime(toStartOfMonth(toTimeZone($start_timestamp, '${TZ}')), '%Y-%m') AS month,
      $channel_type AS channel_type,
      $entry_hostname AS host,
      count() AS sessions,
      sum($pageview_count) AS pageviews
    FROM sessions
    WHERE $start_timestamp >= now() - INTERVAL ${MONTHS_BACK} MONTH
      AND ($entry_pathname IS NULL OR NOT startsWith($entry_pathname, '/admin'))
    GROUP BY month, channel_type, host
    ORDER BY month
    `,
  );
  return rows.map((r) => ({
    month: String(r[0]),
    type: String(r[1] ?? ''),
    host: String(r[2] ?? ''),
    sessions: Number(r[3]) || 0,
    pageviews: Number(r[4]) || 0,
  }));
}

async function fetchTrafficFromEvents(): Promise<Array<{ month: string; type: string; host: string; sessions: number; pageviews: number }>> {
  const rows = await runHogQL(
    'marketing_performance.traffic',
    `
    SELECT
      formatDateTime(toStartOfMonth(toTimeZone(timestamp, '${TZ}')), '%Y-%m') AS month,
      session.$channel_type AS channel_type,
      properties.$host AS host,
      uniq(properties.$session_id) AS sessions,
      count() AS pageviews
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${MONTHS_BACK} MONTH
      AND (properties.$pathname IS NULL OR NOT startsWith(properties.$pathname, '/admin'))
    GROUP BY month, channel_type, host
    ORDER BY month
    `,
  );
  return rows.map((r) => ({
    month: String(r[0]),
    type: String(r[1] ?? ''),
    host: String(r[2] ?? ''),
    sessions: Number(r[3]) || 0,
    pageviews: Number(r[4]) || 0,
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

type AttribRow = { month: string; publication: string | null; email_click: boolean; utm_medium: string | null; utm_source: string | null };

function attribute(r: AttribRow): Channel {
  if (r.email_click) return 'email';
  return channelFromUtm(r.utm_medium, r.utm_source) ?? 'direct';
}

async function fetchInquiries(since: string) {
  return query<AttribRow>(
    `SELECT ${MONTH_EXPR('i.created_at')} AS month,
            COALESCE(i.publication, adv.publication) AS publication,
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
       LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
      WHERE i.created_at >= $1::date`,
    [since],
  );
}

async function fetchQualified(since: string) {
  return query<AttribRow>(
    `SELECT ${MONTH_EXPR('a.created_at')} AS month,
            COALESCE(a.publication, adv.publication) AS publication,
            (a.advertiser_id IS NOT NULL AND ${ADVERTISER_EMAIL_CLICK('a.advertiser_id', 'a.created_at')}) AS email_click,
            utm.utm_medium, utm.utm_source
       FROM agreements a
       LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
       ${ADVERTISER_UTM('a.advertiser_id', 'a.created_at')}
      WHERE a.created_at >= $1::date
        AND a.status IN ('proposal_sent','proposal_approved','sent','signed','active','expired')`,
    [since],
  );
}

async function fetchSigned(since: string) {
  return query<AttribRow>(
    `SELECT ${MONTH_EXPR('a.signed_at')} AS month,
            COALESCE(a.publication, adv.publication) AS publication,
            (a.advertiser_id IS NOT NULL AND ${ADVERTISER_EMAIL_CLICK('a.advertiser_id', 'a.signed_at')}) AS email_click,
            utm.utm_medium, utm.utm_source
       FROM agreements a
       LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
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
            COALESCE(ag.publication, adv.publication) AS publication,
            ${ADVERTISER_EMAIL_CLICK('v.advertiser_id', 'v.paid_at')} AS email_click,
            utm.utm_medium, utm.utm_source,
            v.amount_cents::text AS amount_cents
       FROM invoices v
       LEFT JOIN agreements ag ON ag.id = v.agreement_id
       LEFT JOIN advertisers adv ON adv.id = v.advertiser_id
       ${ADVERTISER_UTM('v.advertiser_id', 'v.paid_at')}
      WHERE v.status = 'paid'
        AND v.paid_at IS NOT NULL
        AND v.paid_at >= $1::date`,
    [since],
  );
}

async function fetchEmailDelivered(since: string) {
  return query<{ month: string; publication: string | null; delivered: string }>(
    `SELECT ${MONTH_EXPR('r.sent_at')} AS month, c.publication AS publication, COUNT(*)::text AS delivered
       FROM marketing_campaign_outreach_recipients r
       LEFT JOIN marketing_campaign_outreach o ON o.id = r.outreach_id
       LEFT JOIN marketing_campaigns c ON c.id = o.campaign_id
      WHERE r.sent_at IS NOT NULL
        AND r.sent_at >= $1::date
        AND r.status = 'sent'
      GROUP BY 1, 2`,
    [since],
  );
}

export async function fetchSpendEntries(since?: string, pub: PubFilter = 'all'): Promise<SpendEntry[]> {
  await ensureMarketingSpendSchema();
  const rows = await query<{ id: string; month: string; channel: Channel; amount_cents: number; notes: string | null; updated_at: string; publication: string }>(
    `SELECT id, to_char(month, 'YYYY-MM') AS month, channel, amount_cents, notes, updated_at::text, publication
       FROM marketing_spend
      WHERE ($1::date IS NULL OR month >= $1::date)
        AND ($2::text = 'all' OR publication = $2::text)
      ORDER BY month DESC, channel, publication`,
    [since ?? null, pub],
  );
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents), publication: (r.publication === 'all' ? 'all' : pubBucket(r.publication)) }));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function buildMarketingPerformance(pub: PubFilter = 'all'): Promise<MarketingPerformance> {
  const inPub = (v: string | null | undefined, kind: 'record' | 'host' | 'property' | 'audience' = 'record') => {
    if (pub === 'all') return true;
    const b = kind === 'host' ? hostBucket(v) : kind === 'property' ? propertyBucket(v) : kind === 'audience' ? audienceBucket(v ?? '') : pubBucket(v);
    return b === pub;
  };
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

  // External sources run alongside the database/PostHog queries and are
  // capped so a slow third party can't time out the whole dashboard.
  const capped = <T,>(p: Promise<T | null>, ms: number, onTimeout: () => void): Promise<T | null> =>
    Promise.race([p, new Promise<null>((resolve) => setTimeout(() => { onTimeout(); resolve(null); }, ms))]);
  const externals = Promise.all([
    capped(ga4Promise, 15_000, () => { sources.ga4.error ??= 'Google Analytics took too long to respond.'; }),
    capped(mcPromise, 15_000, () => { if (!sources.mailchimp.connected) sources.mailchimp.error ??= 'Mailchimp took too long to respond; try Refresh in a minute.'; }),
  ]);

  const [[ga4, mailchimp], [traffic, inquiries, qualified, signed, revenue, delivered, spend]] = await Promise.all([externals, Promise.all([
    settle('PostHog traffic', fetchTraffic(), []),
    settle('Ad inquiries', fetchInquiries(since), []),
    settle('Agreements (qualified)', fetchQualified(since), []),
    settle('Agreements (signed)', fetchSigned(since), []),
    settle('Paid invoices', fetchRevenue(since), []),
    settle('Email deliveries', fetchEmailDelivered(since), []),
    settle('Marketing spend', fetchSpendEntries(since, pub), [] as SpendEntry[]),
  ])]);

  let firstTrafficMonth: string | null = null;
  for (const t of traffic) {
    if (!inPub(t.host, 'host')) continue;
    const c = cell(t.month, channelFromPosthog(t.type));
    if (!c) continue;
    c.sessions += t.sessions;
    c.impressions += t.pageviews;
    c.pageviews += t.pageviews;
    if (t.sessions > 0 && (!firstTrafficMonth || t.month < firstTrafficMonth)) firstTrafficMonth = t.month;
  }
  for (const d of delivered) {
    if (!inPub(d.publication)) continue;
    const c = cell(d.month, 'email');
    if (c) c.impressions += Number(d.delivered) || 0;
  }
  let firstGa4Month: string | null = null;
  for (const g of ga4?.rows ?? []) {
    if (!inPub(g.propertyName, 'property')) continue;
    const c = cell(g.month, channelFromPosthog(g.channelGroup));
    if (!c) continue;
    c.ga4_sessions += g.sessions;
    c.ga4_pageviews += g.pageviews;
    c.ga4_key_events += g.keyEvents;
    if (g.sessions > 0 && (!firstGa4Month || g.month < firstGa4Month)) firstGa4Month = g.month;
  }
  const mcAudience = (mailchimp?.byAudience ?? []).filter((m) => inPub(m.listId, 'audience'));
  for (const m of mcAudience) {
    const c = cell(m.month, 'email');
    if (!c) continue;
    c.mc_delivered += m.delivered;
    c.impressions += m.delivered;
  }
  for (const r of inquiries) { if (!inPub(r.publication)) continue; const c = cell(r.month, attribute(r)); if (c) c.mqls += 1; }
  for (const r of qualified) { if (!inPub(r.publication)) continue; const c = cell(r.month, attribute(r)); if (c) c.sqls += 1; }
  for (const r of signed) { if (!inPub(r.publication)) continue; const c = cell(r.month, attribute(r)); if (c) c.conversions += 1; }
  for (const r of revenue) {
    if (!inPub(r.publication)) continue;
    const c = cell(r.month, attribute(r));
    if (c) c.revenue_cents += Number(r.amount_cents) || 0;
  }
  for (const s of spend) {
    const c = cell(s.month, s.channel);
    if (c) c.spend_cents += s.amount_cents;
  }

  // Month table for the Mailchimp card: scoped audiences summed per month.
  const mcByMonth = new Map<string, MailchimpMonth>();
  const mcByPub: Record<PubBucket, Map<string, MailchimpMonth>> = { austin: new Map(), san_antonio: new Map(), other: new Map() };
  const fold = (map: Map<string, MailchimpMonth>, m: MailchimpMonth) => {
    const t = map.get(m.month) ?? { month: m.month, campaigns: 0, sent: 0, delivered: 0, uniqueOpens: 0, uniqueClicks: 0, unsubscribes: 0 };
    t.campaigns += m.campaigns; t.sent += m.sent; t.delivered += m.delivered;
    t.uniqueOpens += m.uniqueOpens; t.uniqueClicks += m.uniqueClicks; t.unsubscribes += m.unsubscribes;
    map.set(m.month, t);
  };
  for (const m of mailchimp?.byAudience ?? []) {
    fold(mcByPub[audienceBucket(m.listId)], m);
    if (inPub(m.listId, 'audience')) fold(mcByMonth, m);
  }
  const sortedMonths = (map: Map<string, MailchimpMonth>) => Array.from(map.values()).filter((m) => months.includes(m.month)).sort((a, b) => a.month.localeCompare(b.month));

  return {
    publication: pub,
    asOf: new Date().toISOString(),
    months,
    rows: Array.from(grid.values()),
    spend,
    firstTrafficMonth,
    firstGa4Month,
    mailchimp: sortedMonths(mcByMonth),
    mailchimpByPublication: { austin: sortedMonths(mcByPub.austin), san_antonio: sortedMonths(mcByPub.san_antonio), other: sortedMonths(mcByPub.other) },
    sources,
    warnings,
  };
}
