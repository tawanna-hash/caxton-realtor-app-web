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

async function mc<T>(path: string): Promise<T> {
  const { url, auth } = base();
  const res = await fetch(`${url}${path}`, { headers: { Authorization: auth }, cache: 'no-store' });
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

export async function fetchMailchimpSummary(sinceIso: string): Promise<MailchimpSummary> {
  const [account, first] = await Promise.all([
    mc<{ account_name?: string }>('/?fields=account_name').catch(() => ({ account_name: undefined })),
    mc<ReportsResponse>(`/reports?count=1000&offset=0&since_send_time=${encodeURIComponent(sinceIso)}`),
  ]);
  const reports = [...first.reports];
  for (let offset = 1000; offset < first.total_items; offset += 1000) {
    const page = await mc<ReportsResponse>(`/reports?count=1000&offset=${offset}&since_send_time=${encodeURIComponent(sinceIso)}`);
    reports.push(...page.reports);
  }

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
  return {
    accountName: account.account_name ?? null,
    months: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
  };
}
