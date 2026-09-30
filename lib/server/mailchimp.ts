// lib/server/mailchimp.ts
//
// Mailchimp Marketing API (read-only) for /admin/marketing-performance.
//
// Auth: MAILCHIMP_API_KEY in Vercel env (format `<key>-<dc>`, e.g.
// `abc123-us21`). The data-center suffix picks the API host. Optional
// MAILCHIMP_SERVER_PREFIX overrides it.

export interface MailchimpMonth {
  month: string; // YYYY-MM (America/Chicago)
  campaigns: number;
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  unsubscribes: number;
}

export interface MailchimpSummary {
  accountName: string | null;
  months: MailchimpMonth[];
}

export function isMailchimpConfigured(): boolean {
  return Boolean(process.env.MAILCHIMP_API_KEY);
}

function base(): { url: string; auth: string } {
  const key = process.env.MAILCHIMP_API_KEY ?? '';
  const dc = process.env.MAILCHIMP_SERVER_PREFIX || key.split('-')[1];
  if (!key || !dc) throw new Error('MAILCHIMP_API_KEY is missing or has no data-center suffix (e.g. -us21).');
  return { url: `https://${dc}.api.mailchimp.com/3.0`, auth: `Basic ${Buffer.from(`rnn:${key}`).toString('base64')}` };
}

async function mc<T>(path: string, timeoutMs = 12_000): Promise<T> {
  const { url, auth } = base();
  const res = await fetch(`${url}${path}`, {
    headers: { Authorization: auth },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mailchimp ${res.status}: ${text.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

function chicagoMonth(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
}

interface ReportsResponse {
  reports: Array<{
    send_time: string;
    emails_sent: number;
    bounces?: { hard_bounces?: number; soft_bounces?: number; syntax_errors?: number };
    opens?: { unique_opens?: number };
    clicks?: { unique_subscriber_clicks?: number };
    unsubscribed?: number;
  }>;
  total_items: number;
}

// Only the fields the dashboard uses — full report objects are large and slow.
const REPORT_FIELDS = [
  'total_items',
  'reports.send_time',
  'reports.emails_sent',
  'reports.bounces',
  'reports.opens.unique_opens',
  'reports.clicks.unique_subscriber_clicks',
  'reports.unsubscribed',
].join(',');
const PAGE = 200;
const CACHE_MS = 15 * 60_000;
let cache: { key: string; at: number; value: MailchimpSummary } | null = null;

export async function fetchMailchimpSummary(sinceIso: string): Promise<MailchimpSummary> {
  if (cache && cache.key === sinceIso && Date.now() - cache.at < CACHE_MS) return cache.value;

  const page = (offset: number) => mc<ReportsResponse>(
    `/reports?count=${PAGE}&offset=${offset}&since_send_time=${encodeURIComponent(sinceIso)}&fields=${REPORT_FIELDS}`,
  );
  const [account, first] = await Promise.all([
    mc<{ account_name?: string }>('/?fields=account_name', 5_000).catch(() => ({ account_name: undefined })),
    page(0),
  ]);
  const offsets: number[] = [];
  for (let o = PAGE; o < first.total_items; o += PAGE) offsets.push(o);
  const rest = await Promise.all(offsets.map(page));
  const reports = [first, ...rest].flatMap((r) => r.reports ?? []);

  const byMonth = new Map<string, MailchimpMonth>();
  for (const r of reports) {
    if (!r.send_time) continue;
    const month = chicagoMonth(r.send_time);
    const m = byMonth.get(month) ?? { month, campaigns: 0, sent: 0, delivered: 0, uniqueOpens: 0, uniqueClicks: 0, unsubscribes: 0 };
    const bounced = (r.bounces?.hard_bounces ?? 0) + (r.bounces?.soft_bounces ?? 0) + (r.bounces?.syntax_errors ?? 0);
    m.campaigns += 1;
    m.sent += r.emails_sent ?? 0;
    m.delivered += Math.max(0, (r.emails_sent ?? 0) - bounced);
    m.uniqueOpens += r.opens?.unique_opens ?? 0;
    m.uniqueClicks += r.clicks?.unique_subscriber_clicks ?? 0;
    m.unsubscribes += r.unsubscribed ?? 0;
    byMonth.set(month, m);
  }
  const value: MailchimpSummary = {
    accountName: account.account_name ?? null,
    months: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
  cache = { key: sinceIso, at: Date.now(), value };
  return value;
}

// ── UTM auto-tagging ─────────────────────────────────────────────────────────
//
// Mailchimp has no account-wide default for Google Analytics link tracking, so
// /api/cron/mailchimp-utm turns it on for every unsent campaign that lacks it.
// That makes Mailchimp append utm_source / utm_medium=email / utm_campaign to
// every link at send time. Scheduled campaigns must be unscheduled to edit;
// they are rescheduled at the exact same time. Campaigns sending within the
// next 10 minutes are left alone to avoid racing the send.

export function utmTagFromTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'campaign';
}

async function mcWrite(method: 'PATCH' | 'POST', path: string, body?: unknown): Promise<void> {
  const { url, auth } = base();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mailchimp ${method} ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
}

interface UnsentCampaign {
  id: string;
  type: string;
  status: string;
  send_time: string;
  settings?: { title?: string };
  tracking?: { google_analytics?: string; text_clicks?: boolean };
}

export interface UtmResult { id: string; title: string; status: string; tag?: string; action: 'tagged' | 'skipped' | 'error'; detail?: string }

export async function ensureUtmTracking(): Promise<UtmResult[]> {
  const fields = 'campaigns.id,campaigns.type,campaigns.status,campaigns.send_time,campaigns.settings.title,campaigns.tracking';
  const lists = await Promise.all(['save', 'paused', 'schedule'].map((status) =>
    mc<{ campaigns: UnsentCampaign[] }>(`/campaigns?status=${status}&count=1000&fields=${fields}`)));
  const results: UtmResult[] = [];
  for (const c of lists.flatMap((l) => l.campaigns ?? [])) {
    const title = c.settings?.title ?? c.id;
    if (c.tracking?.google_analytics) continue;
    if (c.type === 'rss' || c.type === 'automation') { results.push({ id: c.id, title, status: c.status, action: 'skipped', detail: c.type }); continue; }
    const scheduled = c.status === 'schedule';
    if (scheduled && (!c.send_time || new Date(c.send_time).getTime() - Date.now() < 10 * 60_000)) {
      results.push({ id: c.id, title, status: c.status, action: 'skipped', detail: 'sends within 10 minutes' });
      continue;
    }
    const tag = utmTagFromTitle(title);
    const tracking: Record<string, unknown> = { google_analytics: tag };
    if (c.type === 'variate') tracking.text_clicks = true; // required by Mailchimp for A/B campaigns
    try {
      if (scheduled) await mcWrite('POST', `/campaigns/${c.id}/actions/unschedule`);
      try {
        await mcWrite('PATCH', `/campaigns/${c.id}`, { tracking });
      } finally {
        if (scheduled) await mcWrite('POST', `/campaigns/${c.id}/actions/schedule`, { schedule_time: c.send_time });
      }
      results.push({ id: c.id, title, status: c.status, tag, action: 'tagged' });
    } catch (err) {
      results.push({ id: c.id, title, status: c.status, tag, action: 'error', detail: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
