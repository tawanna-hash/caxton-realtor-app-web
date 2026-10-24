// lib/server/meta-pages.ts
//
// Facebook Page insights (read-only) for /admin/marketing-performance.
//
// Auth: META_ACCESS_TOKEN in Vercel env — a system-user token with access to
// the business Pages (pages_show_list, pages_read_engagement, read_insights).
// Pages are discovered from /me/accounts and matched to a publication by
// handle, so no page ids need to be configured:
//   facebook.com/myrealtyline  → RealtyLine Austin
//   facebook.com/newslinesa    → Newsline San Antonio
// Instagram professional accounts are reached through the linked Page
// (instagram_basic + instagram_manage_insights on the same token):
//   instagram.com/myrealtyline          → RealtyLine Austin
//   instagram.com/newsline_sanantonio   → Newsline San Antonio
// Override the handles with META_PAGE_HANDLE_AUSTIN / META_PAGE_HANDLE_SAN_ANTONIO.

export type MetaPub = 'austin' | 'san_antonio';

export interface MetaMonth { month: string; views: number; engagements: number }
export interface MetaPageInfo { pub: MetaPub; id: string; name: string; handle: string | null; followers: number | null }
export interface InstagramMonth { month: string; views: number; interactions: number }
export interface InstagramAccountInfo { pub: MetaPub; id: string; username: string; followers: number | null }
export interface MetaSummary {
  pages: MetaPageInfo[];
  /** Instagram accounts linked to the matched Pages. */
  instagram: InstagramAccountInfo[];
  /** Monthly Instagram views + interactions per publication. */
  instagramByPublication: Record<MetaPub, InstagramMonth[]>;
  /** Monthly page views + engagements per publication. */
  byPublication: Record<MetaPub, MetaMonth[]>;
  warnings: string[];
}

const GRAPH = 'https://graph.facebook.com/v23.0';
const CACHE_MS = 30 * 60_000;
const IG_MONTHS_BACK = 6;
let cache: { key: string; at: number; value: MetaSummary } | null = null;

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN);
}

async function graph<T>(path: string, token: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Meta ${res.status}: ${text.replace(token, '***').slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function chicagoMonth(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
}

interface AccountsResponse {
  data: Array<{ id: string; name: string; username?: string; link?: string; access_token?: string; followers_count?: number; instagram_business_account?: { id: string; username?: string; followers_count?: number } }>;
  paging?: { next?: string };
}

async function listPages(token: string): Promise<AccountsResponse['data']> {
  const out: AccountsResponse['data'] = [];
  let path: string | null = '/me/accounts?fields=id,name,username,link,access_token,followers_count,instagram_business_account%7Bid,username,followers_count%7D&limit=100';
  for (let i = 0; i < 5 && path; i++) {
    const res: AccountsResponse = await graph<AccountsResponse>(path, token);
    out.push(...res.data);
    path = res.paging?.next ? res.paging.next.replace(GRAPH, '').replace(/([?&])access_token=[^&]*&?/, '$1').replace(/[?&]$/, '') : null;
  }
  return out;
}

interface InsightsResponse { data: Array<{ name: string; values: Array<{ value: number | Record<string, number>; end_time: string }> }> }

/** Daily values for one page metric, in ≤90-day windows (Graph limit is 93). */
async function dailyMetric(pageId: string, pageToken: string, metric: string, monthsBack: number): Promise<Map<string, number>> {
  const byMonth = new Map<string, number>();
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86_400;
  // Meta keeps ~2 years of page insights.
  const start = now - Math.min(monthsBack * 31, 700) * DAY;
  const windows: Array<[number, number]> = [];
  for (let s = start; s < now; s += 90 * DAY) windows.push([s, Math.min(s + 90 * DAY, now)]);
  const results = await Promise.all(windows.map(([since, until]) =>
    graph<InsightsResponse>(`/${pageId}/insights?metric=${metric}&period=day&since=${since}&until=${until}`, pageToken)));
  for (const r of results) {
    for (const series of r.data ?? []) {
      for (const v of series.values ?? []) {
        const n = typeof v.value === 'number' ? v.value : 0;
        // end_time marks the end of the day bucket; step back to land in the right month.
        const month = chicagoMonth(new Date(new Date(v.end_time).getTime() - 12 * 3_600_000).toISOString());
        byMonth.set(month, (byMonth.get(month) ?? 0) + n);
      }
    }
  }
  return byMonth;
}

interface IgTotals { data: Array<{ name: string; total_value?: { value: number } }> }

/** Month totals for an Instagram account. Graph caps each window at 30 days, so a 31-day month takes two calls. */
async function instagramMonths(igId: string, token: string, monthsBack: number): Promise<InstagramMonth[]> {
  const DAY = 86_400;
  const now = new Date();
  const out: InstagramMonth[] = [];
  const jobs: Array<Promise<InstagramMonth | null>> = [];
  for (let i = 0; i < monthsBack; i++) {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1) / 1000;
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1) / 1000;
    const month = new Date(start * 1000).toISOString().slice(0, 7);
    const windows: Array<[number, number]> = [];
    for (let s = start; s < next; s += 30 * DAY) windows.push([s, Math.min(s + 30 * DAY, next, Math.floor(Date.now() / 1000))]);
    jobs.push((async () => {
      const parts = await Promise.all(windows.filter(([a, b]) => b > a).map(([since, until]) =>
        graph<IgTotals>(`/${igId}/insights?metric=views,total_interactions&metric_type=total_value&period=day&since=${since}&until=${until}`, token)));
      let views = 0; let interactions = 0;
      for (const r of parts) for (const m of r.data ?? []) {
        if (m.name === 'views') views += m.total_value?.value ?? 0;
        if (m.name === 'total_interactions') interactions += m.total_value?.value ?? 0;
      }
      return { month, views, interactions };
    })());
  }
  for (const r of await Promise.all(jobs)) if (r) out.push(r);
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

export async function fetchMetaSummary(monthsBack: number): Promise<MetaSummary> {
  const token = process.env.META_ACCESS_TOKEN ?? '';
  if (!token) throw new Error('META_ACCESS_TOKEN is not set');
  const key = String(monthsBack);
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value;

  const handles: Record<MetaPub, string> = {
    austin: (process.env.META_PAGE_HANDLE_AUSTIN || 'myrealtyline').toLowerCase(),
    san_antonio: (process.env.META_PAGE_HANDLE_SAN_ANTONIO || 'newslinesa').toLowerCase(),
  };
  const warnings: string[] = [];
  const pages = await listPages(token);
  const value: MetaSummary = { pages: [], instagram: [], instagramByPublication: { austin: [], san_antonio: [] }, byPublication: { austin: [], san_antonio: [] }, warnings };

  for (const pub of ['austin', 'san_antonio'] as MetaPub[]) {
    const h = handles[pub];
    const page = pages.find((p) => (p.username ?? '').toLowerCase() === h || (p.link ?? '').toLowerCase().replace(/\/+$/, '').endsWith(`/${h}`));
    if (!page || !page.access_token) {
      warnings.push(`Facebook page "${h}" was not found on this token. Give the system user access to the page.`);
      continue;
    }
    value.pages.push({ pub, id: page.id, name: page.name, handle: page.username ?? h, followers: page.followers_count ?? null });
    const [views, engagements] = await Promise.all([
      dailyMetric(page.id, page.access_token, 'page_media_view', monthsBack).catch((e) => { warnings.push(`${page.name} views: ${e instanceof Error ? e.message : String(e)}`); return new Map<string, number>(); }),
      dailyMetric(page.id, page.access_token, 'page_post_engagements', monthsBack).catch((e) => { warnings.push(`${page.name} engagement: ${e instanceof Error ? e.message : String(e)}`); return new Map<string, number>(); }),
    ]);
    const ig = page.instagram_business_account;
    if (ig) {
      value.instagram.push({ pub, id: ig.id, username: ig.username ?? '', followers: ig.followers_count ?? null });
      value.instagramByPublication[pub] = await instagramMonths(ig.id, token, IG_MONTHS_BACK)
        .catch((e) => { warnings.push(`Instagram ${ig.username ?? pub}: ${e instanceof Error ? e.message : String(e)}`); return []; });
    } else {
      warnings.push(`No Instagram account is linked to ${page.name}, or the token cannot see it.`);
    }
    const months = new Set([...views.keys(), ...engagements.keys()]);
    value.byPublication[pub] = Array.from(months).sort().map((month) => ({ month, views: views.get(month) ?? 0, engagements: engagements.get(month) ?? 0 }));
  }
  cache = { key, at: Date.now(), value };
  return value;
}
