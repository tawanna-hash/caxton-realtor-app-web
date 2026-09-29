'use client';

// app/admin/marketing-performance/page.tsx
//
// Marketing Performance — cross-channel attribution, funnel, and efficiency
// KPIs from live data (PostHog traffic + Neon leads/agreements/invoices +
// manual monthly spend). Source rules live in
// lib/server/marketing-performance.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import PageTitle from '@/components/ui/PageTitle';

const chartLoading = () => <div className="h-[240px] animate-pulse rounded bg-gray-50" />;
const StackedBars = dynamic(() => import('./_components/Charts').then((m) => m.StackedBars), { ssr: false, loading: chartLoading });
const Lines = dynamic(() => import('./_components/Charts').then((m) => m.Lines), { ssr: false, loading: chartLoading });
const Donut = dynamic(() => import('./_components/Charts').then((m) => m.Donut), { ssr: false, loading: chartLoading });
const HBars = dynamic(() => import('./_components/Charts').then((m) => m.HBars), { ssr: false, loading: chartLoading });

// ============================================================
// Types (mirror lib/server/marketing-performance.ts)
// ============================================================

type Channel = 'organic' | 'paid' | 'social' | 'email' | 'direct';
type Metric = 'impressions' | 'sessions' | 'mqls' | 'sqls' | 'conversions' | 'revenue_cents' | 'spend_cents';

interface ChannelMonthRow {
  month: string;
  channel: Channel;
  impressions: number;
  sessions: number;
  mqls: number;
  sqls: number;
  conversions: number;
  revenue_cents: number;
  spend_cents: number;
  pageviews: number;
  ga4_sessions: number;
  ga4_pageviews: number;
  ga4_key_events: number;
  mc_delivered: number;
}
interface MailchimpMonth { month: string; campaigns: number; sent: number; delivered: number; uniqueOpens: number; uniqueClicks: number; unsubscribes: number }
interface SourceStatus {
  posthog: { connected: boolean };
  ga4: { configured: boolean; connected: boolean; email: string | null; propertyId: string | null; propertyName: string | null; error: string | null };
  mailchimp: { configured: boolean; connected: boolean; accountName: string | null; error: string | null };
}
interface SpendEntry { id: string; month: string; channel: Channel; amount_cents: number; notes: string | null; updated_at: string }
interface MarketingPerformance {
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

const CHANNELS: Array<{ id: Channel; label: string; color: string; hint: string }> = [
  { id: 'organic', label: 'Organic', color: '#2F7D6D', hint: 'Search, referral & AI assistants' },
  { id: 'paid',    label: 'Paid',    color: '#3A5FA8', hint: 'Paid search, paid social, display' },
  { id: 'social',  label: 'Social',  color: '#C0762B', hint: 'Organic social' },
  { id: 'email',   label: 'Email',   color: '#8C4F9E', hint: 'Campaign email clicks & sends' },
  { id: 'direct',  label: 'Direct',  color: '#6B7280', hint: 'Direct / unattributed' },
];
const CH = Object.fromEntries(CHANNELS.map((c) => [c.id, c])) as Record<Channel, (typeof CHANNELS)[number]>;
const METRICS: Metric[] = ['impressions', 'sessions', 'mqls', 'sqls', 'conversions', 'revenue_cents', 'spend_cents'];
const METRIC_LABEL: Record<Metric, string> = {
  impressions: 'Impressions', sessions: 'Sessions', mqls: 'MQLs', sqls: 'SQLs',
  conversions: 'Conversions', revenue_cents: 'Revenue', spend_cents: 'Spend',
};
const BRAND = '#301D5D';

type RangeKey = '3' | '6' | '12' | 'ytd' | 'all' | 'custom';

// ============================================================
// Helpers
// ============================================================

type Totals = Record<Metric, number>;
const zero = (): Totals => ({ impressions: 0, sessions: 0, mqls: 0, sqls: 0, conversions: 0, revenue_cents: 0, spend_cents: 0 });
const div = (a: number, b: number) => (b > 0 ? a / b : NaN);

function fmtInt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return Math.round(v).toLocaleString('en-US');
}
function fmtCents(v: number, precise = false): string {
  if (!Number.isFinite(v)) return '—';
  const d = v / 100;
  const a = Math.abs(d);
  if (!precise && a >= 1e6) return `$${(d / 1e6).toFixed(2)}M`;
  if (!precise && a >= 1e4) return `$${(d / 1e3).toFixed(1)}K`;
  return `$${d.toLocaleString('en-US', { maximumFractionDigits: a < 100 ? 2 : 0, minimumFractionDigits: 0 })}`;
}
const fmtX = (v: number) => (Number.isFinite(v) ? `${v.toFixed(v >= 10 ? 1 : 2)}x` : '—');
const fmtPct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(v < 0.01 && v > 0 ? 2 : 1)}%` : '—');
const fmtMetric = (m: Metric, v: number) => (m === 'revenue_cents' || m === 'spend_cents' ? fmtCents(v) : fmtInt(v));

function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString('en-US', { month: 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }).replace(' ', long ? ' ' : " '");
}

function Delta({ cur, prev, goodWhen }: { cur: number; prev: number | null; goodWhen: 'up' | 'down' }) {
  if (prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) {
    return <span className="text-xs text-gray-400">No prior data</span>;
  }
  const ch = (cur - prev) / Math.abs(prev);
  if (Math.abs(ch) < 0.005) return <span className="text-xs font-medium text-gray-500">→ 0% <span className="font-normal text-gray-400">vs prior</span></span>;
  const good = (ch > 0) === (goodWhen === 'up');
  return (
    <span className={`text-xs font-medium ${good ? 'text-green-700' : 'text-red-700'}`}>
      {ch > 0 ? '↑' : '↓'} {Math.abs(ch * 100).toFixed(1)}% <span className="font-normal text-gray-400">vs prior</span>
    </span>
  );
}

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ v: T; l: string }>; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-gray-100 p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${value === o.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Card({ title, right, children, className = '' }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-md border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function SectionHead({ id, title, sub, right }: { id: string; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div id={id} className="mb-3 flex scroll-mt-24 flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{sub}</p>
      </div>
      {right}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default function MarketingPerformancePage() {
  const [data, setData] = useState<MarketingPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [range, setRange] = useState<RangeKey>('6');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [channels, setChannels] = useState<Set<Channel>>(() => new Set(CHANNELS.map((c) => c.id)));
  const [attrMetric, setAttrMetric] = useState<'revenue_cents' | 'conversions' | 'sessions'>('sessions');
  const [funnelView, setFunnelView] = useState<'lower' | 'upper'>('lower');
  const [effMetric, setEffMetric] = useState<'roas' | 'cac' | 'cpl'>('roas');
  const [trendMetric, setTrendMetric] = useState<Metric>('sessions');
  const [trendMode, setTrendMode] = useState<'channel' | 'total'>('channel');
  const [trafficSource, setTrafficSource] = useState<'posthog' | 'ga4'>('posthog');
  const ga4Ready = Boolean(data?.sources.ga4.propertyId && data.firstGa4Month);
  const src = trafficSource === 'ga4' && ga4Ready ? 'ga4' : 'posthog';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/analytics/marketing-performance', { credentials: 'include', cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: MarketingPerformance; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok || !body.data) {
          setError(body?.error || `Failed to load (${res.status})`);
          return;
        }
        setError(null);
        setData(body.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // ---------- Derived: selected window ----------
  const view = useMemo(() => {
    if (!data) return null;
    const months = data.months;
    const last = months.length - 1;
    const firstMonth = src === 'ga4' ? data.firstGa4Month : data.firstTrafficMonth;
    const firstData = firstMonth ? Math.max(0, months.indexOf(firstMonth)) : 0;
    let start = last - 5;
    let end = last;
    if (range === '3' || range === '6' || range === '12') start = last - Number(range) + 1;
    else if (range === 'ytd') start = months.findIndex((m) => m.endsWith('-01') && m.startsWith(months[last].slice(0, 4)));
    else if (range === 'all') start = firstData;
    else if (range === 'custom') {
      const f = months.indexOf(customFrom);
      const t = months.indexOf(customTo);
      start = f >= 0 ? f : firstData;
      end = t >= 0 ? t : last;
      if (start > end) [start, end] = [end, start];
    }
    start = Math.max(0, start);
    const len = end - start + 1;
    const pStart = start - len;
    const pEnd = start - 1;

    const byMonth = new Map<string, Map<Channel, ChannelMonthRow>>();
    for (const r of data.rows) {
      if (!byMonth.has(r.month)) byMonth.set(r.month, new Map());
      byMonth.get(r.month)!.set(r.channel, src === 'ga4'
        ? { ...r, sessions: r.ga4_sessions, impressions: r.impressions - r.pageviews + r.ga4_pageviews }
        : r);
    }
    const sum = (from: number, to: number, chans: Channel[]): Totals => {
      const t = zero();
      for (let i = from; i <= to; i++) {
        const m = byMonth.get(months[i]);
        if (!m) continue;
        for (const c of chans) {
          const r = m.get(c);
          if (r) for (const k of METRICS) t[k] += r[k];
        }
      }
      return t;
    };
    const sel = CHANNELS.map((c) => c.id).filter((c) => channels.has(c));
    const cur = sum(start, end, sel);
    const prevAvailable = pStart >= 0;
    const prev = prevAvailable ? sum(pStart, pEnd, sel) : null;
    const monthsSel = months.slice(start, end + 1);
    const perMonth = (chans: Channel[], idxFrom = start, idxTo = end) => {
      const out: Totals[] = [];
      for (let i = idxFrom; i <= idxTo; i++) out.push(sum(i, i, chans));
      return out;
    };
    const perChannel = sel.map((c) => ({ c, t: sum(start, end, [c]), months: perMonth([c]) }));
    return { months, start, end, len, cur, prev, prevAvailable, monthsSel, sel, perChannel, perMonth, pStart, pEnd, sum };
  }, [data, range, customFrom, customTo, channels, src]);

  const toggleChannel = (id: Channel | 'all') => {
    setChannels((prev) => {
      if (id === 'all') return prev.size === CHANNELS.length ? new Set<Channel>(['direct']) : new Set(CHANNELS.map((c) => c.id));
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
      return next;
    });
  };

  const hasSpend = (view?.cur.spend_cents ?? 0) > 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-5 py-7 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Insights</p>
          <PageTitle size="md">Marketing Performance</PageTitle>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Attribution, funnel, and efficiency from live PostHog traffic, ad inquiries, agreements, and paid invoices.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Sections">
          {[['attribution', 'Attribution'], ['funnel', 'Funnel'], ['efficiency', 'Efficiency'], ['trends', 'Trends'], ['connections', 'Connections'], ['spend', 'Spend']].map(([id, l]) => (
            <a key={id} href={`#${id}`} className="rounded px-2.5 py-1 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">{l}</a>
          ))}
        </nav>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={reload} className="font-medium underline">Retry</button>
        </div>
      )}

      {!data && !error && (
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-md border border-gray-200 bg-white" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-md border border-gray-200 bg-white" />)}
          </div>
          <div className="h-72 animate-pulse rounded-md border border-gray-200 bg-white" />
        </div>
      )}

      {data && view && (
        <>
          {/* Filters */}
          <section aria-label="Filters" className="sticky top-0 z-20 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-md border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date range</p>
              <div className="flex flex-wrap items-center gap-2">
                <Seg label="Date range" value={range} onChange={(v) => {
                  if (v === 'custom' && !customFrom) {
                    setCustomFrom(data.months[Math.max(0, view.start)]);
                    setCustomTo(data.months[view.end]);
                  }
                  setRange(v);
                }} options={[
                  { v: '3', l: '3M' }, { v: '6', l: '6M' }, { v: '12', l: '12M' }, { v: 'ytd', l: 'YTD' }, { v: 'all', l: 'All data' }, { v: 'custom', l: 'Custom' },
                ]} />
                {range === 'custom' && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <select aria-label="From month" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">
                      {data.months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
                    </select>
                    <span className="text-gray-400">to</span>
                    <select aria-label="To month" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">
                      {data.months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Channels</p>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => {
                  const on = channels.has(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleChannel(c.id)} aria-pressed={on} title={c.hint}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${on ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-gray-200 bg-white text-gray-400'}`}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? c.color : '#d1d5db' }} />
                      {c.label}
                    </button>
                  );
                })}
                <button type="button" onClick={() => toggleChannel('all')} aria-pressed={channels.size === CHANNELS.length}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${channels.size === CHANNELS.length ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-gray-200 text-gray-500'}`}>
                  All
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Traffic source</p>
              {ga4Ready ? (
                <Seg label="Traffic source" value={src} onChange={setTrafficSource} options={[{ v: 'posthog', l: 'PostHog' }, { v: 'ga4', l: 'GA4' }]} />
              ) : (
                <p className="py-1 text-xs text-gray-500">PostHog · <a href="#connections" className="font-medium text-[#301D5D] underline">Connect GA4</a></p>
              )}
            </div>
            <div className="ml-auto text-right text-xs text-gray-500">
              <p>{monthLabel(data.months[view.start], true)} – {monthLabel(data.months[view.end], true)}</p>
              <p className="text-gray-400">
                Updated {new Date(data.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {' · '}<button type="button" onClick={reload} className="underline hover:text-gray-700">Refresh</button>
              </p>
            </div>
          </section>

          {data.warnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              {data.warnings.map((w) => <p key={w}>{w}</p>)}
            </div>
          )}
          {(() => {
            const first = src === 'ga4' ? data.firstGa4Month : data.firstTrafficMonth;
            return first && view.start < data.months.indexOf(first) ? (
              <p className="text-xs text-gray-500">{src === 'ga4' ? 'GA4' : 'PostHog'} traffic starts {monthLabel(first, true)}; earlier months show leads and revenue only.</p>
            ) : null;
          })()}

          {/* KPIs */}
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {([
              { label: 'Attributed revenue', v: view.cur.revenue_cents, p: view.prev?.revenue_cents ?? null, f: (x: number) => fmtCents(x), good: 'up', spark: (t: Totals) => t.revenue_cents },
              { label: 'Conversions', v: view.cur.conversions, p: view.prev?.conversions ?? null, f: fmtInt, good: 'up', spark: (t: Totals) => t.conversions, sub: 'Signed agreements' },
              { label: 'CAC', v: div(view.cur.spend_cents, view.cur.conversions), p: view.prev ? div(view.prev.spend_cents, view.prev.conversions) : null, f: (x: number) => fmtCents(x, true), good: 'down', spark: (t: Totals) => div(t.spend_cents, t.conversions), needsSpend: true },
              { label: 'ROAS', v: div(view.cur.revenue_cents, view.cur.spend_cents), p: view.prev ? div(view.prev.revenue_cents, view.prev.spend_cents) : null, f: fmtX, good: 'up', spark: (t: Totals) => div(t.revenue_cents, t.spend_cents), needsSpend: true },
              { label: 'Cost per lead', v: div(view.cur.spend_cents, view.cur.mqls), p: view.prev ? div(view.prev.spend_cents, view.prev.mqls) : null, f: (x: number) => fmtCents(x, true), good: 'down', spark: (t: Totals) => div(t.spend_cents, t.mqls), needsSpend: true },
            ] as const).map((k) => (
              <div key={k.label} className="min-w-0 rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-gray-500">{k.label}</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900">
                  {'needsSpend' in k && k.needsSpend && !hasSpend ? '—' : k.f(k.v)}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {'needsSpend' in k && k.needsSpend && !hasSpend
                    ? <a href="#spend" className="text-xs font-medium text-[#301D5D] underline">Add spend</a>
                    : <Delta cur={k.v} prev={view.prevAvailable ? k.p : null} goodWhen={k.good} />}
                  <Sparkline values={view.perMonth(view.sel).map(k.spark)} />
                </div>
              </div>
            ))}
          </section>

          {/* Attribution */}
          <section>
            <SectionHead id="attribution" title="Cross-channel attribution" sub="Traffic, conversions, and revenue by channel"
              right={<Seg label="Attribution metric" value={attrMetric} onChange={setAttrMetric} options={[{ v: 'sessions', l: 'Sessions' }, { v: 'conversions', l: 'Conversions' }, { v: 'revenue_cents', l: 'Revenue' }]} />} />
            <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
              <Card title="Channel mix">
                <Donut fmt={(x) => fmtMetric(attrMetric, x)}
                  data={view.perChannel.map(({ c, t }) => ({ key: c, label: CH[c].label, value: t[attrMetric], color: CH[c].color }))} />
                <ul className="mt-3 space-y-1.5">
                  {[...view.perChannel].sort((a, b) => b.t[attrMetric] - a.t[attrMetric]).map(({ c, t }) => {
                    const total = view.cur[attrMetric];
                    return (
                      <li key={c} className="grid grid-cols-[10px_1fr_auto_48px] items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CH[c].color }} />
                        <span className="text-gray-700">{CH[c].label}</span>
                        <span className="font-medium tabular-nums text-gray-900">{fmtMetric(attrMetric, t[attrMetric])}</span>
                        <span className="text-right tabular-nums text-gray-400">{fmtPct(div(t[attrMetric], total))}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <Card title={`Monthly ${METRIC_LABEL[attrMetric].toLowerCase()} by channel`}>
                <StackedBars fmt={(x) => fmtMetric(attrMetric, x)}
                  series={view.sel.map((c) => ({ key: c, label: CH[c].label, color: CH[c].color }))}
                  data={view.monthsSel.map((m, i) => Object.fromEntries([['label', monthLabel(m)], ...view.perChannel.map(({ c, months }) => [c, months[i][attrMetric]])]))} />
              </Card>
            </div>
            <div className="mt-3 overflow-x-auto rounded-md border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-2.5">Channel</th>
                    {['Impr.', 'Sessions', 'MQLs', 'SQLs', 'Conv.', 'Revenue', 'Spend', 'ROAS', 'CPL'].map((h) => <th key={h} className="px-4 py-2.5 text-right">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 tabular-nums">
                  {[...view.perChannel].sort((a, b) => b.t.sessions - a.t.sessions).map(({ c, t }) => (
                    <tr key={c} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2 font-medium text-gray-900"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: CH[c].color }} />{CH[c].label}</span></td>
                      <td className="px-4 py-2.5 text-right">{fmtInt(t.impressions)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtInt(t.sessions)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtInt(t.mqls)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtInt(t.sqls)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtInt(t.conversions)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtCents(t.revenue_cents)}</td>
                      <td className="px-4 py-2.5 text-right">{t.spend_cents > 0 ? fmtCents(t.spend_cents) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">{fmtX(div(t.revenue_cents, t.spend_cents))}</td>
                      <td className="px-4 py-2.5 text-right">{t.spend_cents > 0 ? fmtCents(div(t.spend_cents, t.mqls), true) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 font-semibold text-gray-900">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right">{fmtInt(view.cur.impressions)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtInt(view.cur.sessions)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtInt(view.cur.mqls)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtInt(view.cur.sqls)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtInt(view.cur.conversions)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtCents(view.cur.revenue_cents)}</td>
                    <td className="px-4 py-2.5 text-right">{hasSpend ? fmtCents(view.cur.spend_cents) : '—'}</td>
                    <td className="px-4 py-2.5 text-right">{fmtX(div(view.cur.revenue_cents, view.cur.spend_cents))}</td>
                    <td className="px-4 py-2.5 text-right">{hasSpend ? fmtCents(div(view.cur.spend_cents, view.cur.mqls), true) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Funnel */}
          <section>
            <SectionHead id="funnel" title="Funnel" sub="Impressions → sessions → leads → qualified → signed" />
            <div className="grid gap-3 lg:grid-cols-[1fr_1.25fr]">
              <Card title="Stage volume & step conversion">
                <FunnelBars t={view.cur} />
              </Card>
              <Card title="Monthly pipeline"
                right={<Seg label="Pipeline stages" value={funnelView} onChange={setFunnelView} options={[{ v: 'lower', l: 'MQL → Conv.' }, { v: 'upper', l: 'Impr. → Sessions' }]} />}>
                <Lines fmt={fmtInt}
                  series={funnelView === 'lower'
                    ? [{ key: 'mqls', label: 'MQLs', color: BRAND }, { key: 'sqls', label: 'SQLs', color: '#3A5FA8' }, { key: 'conversions', label: 'Conversions', color: '#C0762B' }]
                    : [{ key: 'impressions', label: 'Impressions', color: BRAND }, { key: 'sessions', label: 'Sessions', color: '#3A5FA8' }]}
                  data={view.perMonth(view.sel).map((t, i) => ({ label: monthLabel(view.monthsSel[i]), ...t }))} />
              </Card>
            </div>
          </section>

          {/* Efficiency */}
          <section>
            <SectionHead id="efficiency" title="Efficiency" sub="Acquisition cost and return on spend" />
            {!hasSpend ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-white px-6 py-8 text-center">
                <p className="text-sm font-medium text-gray-900">No spend recorded for this range</p>
                <p className="mt-1 text-sm text-gray-500">CAC, ROAS, and cost per lead need monthly spend by channel.</p>
                <a href="#spend" className="mt-3 inline-block rounded-md bg-[#301D5D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#241548]">Add spend</a>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  {([
                    { key: 'cac', label: 'CAC', v: div(view.cur.spend_cents, view.cur.conversions), f: (x: number) => fmtCents(x, true), s: (t: Totals) => div(t.spend_cents, t.conversions), hint: 'Spend ÷ conversions' },
                    { key: 'roas', label: 'ROAS', v: div(view.cur.revenue_cents, view.cur.spend_cents), f: fmtX, s: (t: Totals) => div(t.revenue_cents, t.spend_cents), hint: 'Revenue ÷ spend' },
                    { key: 'cpl', label: 'Cost per lead', v: div(view.cur.spend_cents, view.cur.mqls), f: (x: number) => fmtCents(x, true), s: (t: Totals) => div(t.spend_cents, t.mqls), hint: 'Spend ÷ MQLs' },
                  ]).map((e) => (
                    <Card key={e.key} title={e.label} right={<span className="text-lg font-semibold tabular-nums text-gray-900">{e.f(e.v)}</span>}>
                      <Lines height={140} legend={false} fmt={e.f}
                        series={[{ key: 'v', label: e.label, color: BRAND }]}
                        data={view.perMonth(view.sel).map((t, i) => ({ label: monthLabel(view.monthsSel[i]), v: Number.isFinite(e.s(t)) ? e.s(t) : null }))} />
                      <p className="mt-1 text-xs text-gray-400">{e.hint}</p>
                    </Card>
                  ))}
                </div>
                <Card className="mt-3" title="Efficiency by channel"
                  right={<Seg label="Efficiency metric" value={effMetric} onChange={setEffMetric} options={[{ v: 'roas', l: 'ROAS' }, { v: 'cac', l: 'CAC' }, { v: 'cpl', l: 'CPL' }]} />}>
                  {(() => {
                    const rows = view.perChannel.filter(({ t }) => t.spend_cents > 0).map(({ c, t }) => ({
                      label: CH[c].label, color: CH[c].color,
                      value: effMetric === 'roas' ? div(t.revenue_cents, t.spend_cents) : effMetric === 'cac' ? div(t.spend_cents, t.conversions) : div(t.spend_cents, t.mqls),
                    })).filter((r) => Number.isFinite(r.value));
                    if (rows.length === 0) return <p className="py-6 text-center text-sm text-gray-500">Not enough conversions or leads on channels with spend yet.</p>;
                    return <HBars height={Math.max(120, rows.length * 44)} data={rows} fmt={effMetric === 'roas' ? fmtX : (x) => fmtCents(x, true)} />;
                  })()}
                </Card>
              </>
            )}
          </section>

          {/* Trends */}
          <section>
            <SectionHead id="trends" title="Monthly trends" sub="Compare any metric across channels"
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Trend metric" value={trendMetric} onChange={(e) => setTrendMetric(e.target.value as Metric)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">
                    {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
                  </select>
                  <Seg label="Trend style" value={trendMode} onChange={setTrendMode} options={[{ v: 'channel', l: 'By channel' }, { v: 'total', l: 'Total vs prior' }]} />
                </div>
              } />
            <Card>
              {trendMode === 'channel' ? (
                <Lines height={320} fmt={(x) => fmtMetric(trendMetric, x)}
                  series={view.sel.map((c) => ({ key: c, label: CH[c].label, color: CH[c].color }))}
                  data={view.monthsSel.map((m, i) => Object.fromEntries([['label', monthLabel(m)], ...view.perChannel.map(({ c, months }) => [c, months[i][trendMetric]])]))} />
              ) : (
                <Lines height={320} fmt={(x) => fmtMetric(trendMetric, x)}
                  series={[
                    { key: 'cur', label: 'Selected period', color: BRAND },
                    ...(view.prevAvailable ? [{ key: 'prev', label: 'Prior period', color: '#9ca3af', dashed: true }] : []),
                  ]}
                  data={view.perMonth(view.sel).map((t, i) => ({
                    label: monthLabel(view.monthsSel[i]),
                    cur: t[trendMetric],
                    prev: view.prevAvailable ? view.sum(view.pStart + i, view.pStart + i, view.sel)[trendMetric] : null,
                  }))} />
              )}
            </Card>
          </section>

          {/* Connections */}
          <Connections sources={data.sources} mailchimp={data.mailchimp.filter((m) => view.monthsSel.includes(m.month))} onChanged={reload} />

          {/* Spend */}
          <SpendPanel months={data.months} entries={data.spend} onSaved={reload} />

          <details className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-900">How these numbers are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><b>Impressions</b>: public-site pageviews (PostHog or GA4, per the Traffic source toggle) plus delivered campaign emails (in-app composer and Mailchimp) on the Email channel.</li>
              <li><b>Sessions</b>: PostHog sessions by channel type, or GA4 sessions by default channel group (Organic = search, referral, AI; Social = organic social; Paid = paid search/social/display).</li>
              <li><b>MQLs</b>: advertiser inquiries. <b>SQLs</b>: agreements that reached proposal sent or later. <b>Conversions</b>: signed agreements.</li>
              <li><b>Revenue</b>: invoices marked paid, by paid date.</li>
              <li><b>Attribution</b>: Email when the advertiser clicked a campaign email in the prior 90 days; otherwise the inquiry&apos;s UTM tags; otherwise Direct.</li>
              <li><b>Spend</b>: monthly entries below. Months are in Central time.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

// ============================================================
// Pieces
// ============================================================

function Sparkline({ values }: { values: number[] }) {
  const v = values.map((x) => (Number.isFinite(x) ? x : NaN));
  const finite = v.filter(Number.isFinite);
  if (finite.length < 2) return <span className="h-6 w-20" />;
  const min = Math.min(...finite), max = Math.max(...finite), r = max - min || 1;
  const w = 80, h = 24;
  const pts = v.map((y, i) => Number.isFinite(y) ? `${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((y - min) / r) * (h - 4)).toFixed(1)}` : null).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke={BRAND} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function FunnelBars({ t }: { t: Totals }) {
  const stages: Array<{ k: Metric; l: string }> = [
    { k: 'impressions', l: 'Impressions' }, { k: 'sessions', l: 'Sessions' }, { k: 'mqls', l: 'MQLs' }, { k: 'sqls', l: 'SQLs' }, { k: 'conversions', l: 'Conversions' },
  ];
  const vals = stages.map((s) => t[s.k]);
  const top = Math.max(...vals, 1);
  const hi = Math.log10(top + 1);
  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const v = vals[i];
        const w = v > 0 ? 18 + 82 * (Math.log10(v + 1) / hi) : 0;
        const prevV = i > 0 ? vals[i - 1] : 0;
        return (
          <div key={s.k}>
            {i > 0 && (
              <p className="pl-[108px] text-xs text-gray-400">↳ <b className="font-semibold text-gray-600">{fmtPct(div(v, prevV))}</b> from {stages[i - 1].l}</p>
            )}
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{s.l}</span>
              <div className="h-8">
                {v > 0 ? (
                  <div className="flex h-full items-center rounded px-2.5 text-sm font-semibold tabular-nums text-white transition-[width] duration-500"
                    style={{ width: `${w}%`, backgroundColor: BRAND, opacity: 1 - i * 0.14 }}>
                    {fmtInt(v)}
                  </div>
                ) : (
                  <div className="flex h-full items-center text-sm text-gray-400">0</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <p className="pt-2 text-xs text-gray-400">Bar length log-scaled · {fmtPct(div(t.conversions, t.sessions))} session-to-conversion</p>
    </div>
  );
}

function SpendPanel({ months, entries, onSaved }: { months: string[]; entries: SpendEntry[]; onSaved: () => void }) {
  const [month, setMonth] = useState(months[months.length - 1]);
  const [channel, setChannel] = useState<Channel>('paid');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const save = async () => {
    const dollars = Number(amount.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(dollars) || dollars < 0) { setMsg({ kind: 'err', text: 'Enter a valid amount.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/analytics/marketing-spend', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, channel, amount_cents: Math.round(dollars * 100), notes: notes.trim() || null }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error || `Save failed (${res.status})`);
      setMsg({ kind: 'ok', text: `Saved ${CH[channel].label} · ${monthLabel(month, true)}` });
      setAmount(''); setNotes('');
      onSaved();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this spend entry?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/analytics/marketing-spend?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      onSaved();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed' });
    } finally { setBusy(false); }
  };

  return (
    <section>
      <SectionHead id="spend" title="Marketing spend" sub="Monthly spend by channel · powers CAC, ROAS, and CPL" />
      <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
        <Card title="Add or update spend">
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Month</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5">
                {[...months].reverse().map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Channel</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5">
                {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label} — {c.hint}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Amount (USD)</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 tabular-nums" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Notes (optional)</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Meta boosted posts" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
            </label>
            <button type="button" onClick={() => void save()} disabled={busy || !amount.trim()}
              className="w-full rounded-md bg-[#301D5D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#241548] disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Saving…' : 'Save spend'}
            </button>
            <p className="text-xs text-gray-400">Saving the same month and channel replaces the earlier amount.</p>
            {msg && <p className={`text-xs ${msg.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
          </div>
        </Card>
        <Card title={`Entries (${entries.length})`}>
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No spend entered yet.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto overscroll-contain">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <th className="py-2 pr-3">Month</th><th className="py-2 pr-3">Channel</th><th className="py-2 pr-3 text-right">Amount</th><th className="py-2 pr-3">Notes</th><th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 pr-3 text-gray-700">{monthLabel(e.month, true)}</td>
                      <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: CH[e.channel].color }} />{CH[e.channel].label}</span></td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">{fmtCents(e.amount_cents, true)}</td>
                      <td className="max-w-[220px] truncate py-2 pr-3 text-gray-500" title={e.notes ?? ''}>{e.notes || '—'}</td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => void remove(e.id)} disabled={busy} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

function Connections({ sources, mailchimp, onChanged }: { sources: SourceStatus; mailchimp: MailchimpMonth[]; onChanged: () => void }) {
  const [props, setProps] = useState<Array<{ id: string; name: string; account: string }> | null>(null);
  const [propError, setPropError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search);
    const g = p.get('ga4');
    if (g === 'connected') return 'Google Analytics connected. Tick the properties to include below.';
    if (g === 'error') return `Google Analytics connection failed (${p.get('reason') ?? 'unknown'}).`;
    return null;
  });

  useEffect(() => {
    if (!sources.ga4.connected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ga4-auth/properties', { credentials: 'include', cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as { properties?: Array<{ id: string; name: string; account: string }>; error?: string | null } | null;
        if (cancelled) return;
        setProps(body?.properties ?? []);
        setPropError(body?.error ?? (res.ok ? null : `Failed (${res.status})`));
      } catch (err) {
        if (!cancelled) setPropError(err instanceof Error ? err.message : 'Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [sources.ga4.connected]);

  const selectedIds = (sources.ga4.propertyId ?? '').split(',').filter(Boolean);
  const toggle = async (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    const chosen = (props ?? []).filter((p) => next.includes(p.id)).map((p) => ({ id: p.id, name: p.name }));
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ga4-auth/properties', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: chosen }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      onChanged();
    } catch (err) { setPropError(err instanceof Error ? err.message : 'Save failed'); } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Analytics?')) return;
    setBusy(true);
    try {
      await fetch('/api/admin/ga4-auth/properties', { method: 'DELETE', credentials: 'include' });
      setProps(null);
      onChanged();
    } finally { setBusy(false); }
  };

  const status = (ok: boolean, label: string) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-600' : 'bg-gray-400'}`} />{label}
    </span>
  );

  const mcTotals = mailchimp.reduce((a, m) => ({ sent: a.sent + m.sent, delivered: a.delivered + m.delivered, opens: a.opens + m.uniqueOpens, clicks: a.clicks + m.uniqueClicks, campaigns: a.campaigns + m.campaigns }), { sent: 0, delivered: 0, opens: 0, clicks: 0, campaigns: 0 });

  return (
    <section>
      <SectionHead id="connections" title="Data connections" sub="PostHog, Google Analytics 4, and Mailchimp" />
      {notice && <p className="mb-3 rounded border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">{notice}</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="PostHog" right={status(sources.posthog.connected, sources.posthog.connected ? 'Connected' : 'Not configured')}>
          <p className="text-sm text-gray-600">Sessions, pageviews, and channel types from the public app.</p>
        </Card>

        <Card title="Google Analytics 4" right={status(Boolean(sources.ga4.propertyId && !sources.ga4.error), sources.ga4.propertyId ? (sources.ga4.error ? 'Error' : 'Connected') : sources.ga4.connected ? 'Pick properties' : 'Not connected')}>
          {!sources.ga4.configured ? (
            <p className="text-sm text-gray-600">Google OAuth client is not configured on this deployment.</p>
          ) : !sources.ga4.connected ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Read-only access to GA4 sessions, pageviews, and key events by channel.</p>
              <a href="/api/admin/ga4-auth/start" className="inline-block rounded-md bg-[#301D5D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#241548]">Connect Google Analytics</a>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">Signed in as <b className="font-medium text-gray-900">{sources.ga4.email}</b></p>
              <fieldset>
                <legend className="text-xs font-medium text-gray-500">Properties (summed)</legend>
                {!props ? <p className="mt-1 text-xs text-gray-400">Loading…</p> : props.length === 0 ? <p className="mt-1 text-xs text-gray-500">No properties found for this account.</p> : (
                  <ul className="mt-1 space-y-1">
                    {props.map((p) => (
                      <li key={p.id}>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" disabled={busy} checked={selectedIds.includes(p.id)} onChange={() => void toggle(p.id)} className="h-4 w-4 accent-[#301D5D]" />
                          <span>{p.name} <span className="text-xs text-gray-400">({p.id})</span></span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              {(propError || sources.ga4.error) && <p className="text-xs text-red-700">{propError || sources.ga4.error}</p>}
              <button type="button" onClick={() => void disconnect()} disabled={busy} className="text-xs font-medium text-red-700 hover:underline">Disconnect</button>
            </div>
          )}
        </Card>

        <Card title="Mailchimp" right={status(sources.mailchimp.connected, sources.mailchimp.connected ? 'Connected' : sources.mailchimp.error ? 'Error' : 'Not connected')}>
          {sources.mailchimp.connected ? (
            <div className="space-y-2 text-sm">
              {sources.mailchimp.accountName && <p className="text-gray-600">Account <b className="font-medium text-gray-900">{sources.mailchimp.accountName}</b></p>}
              <div className="grid grid-cols-2 gap-2 tabular-nums">
                <div><p className="text-xs text-gray-500">Campaigns</p><p className="font-semibold">{fmtInt(mcTotals.campaigns)}</p></div>
                <div><p className="text-xs text-gray-500">Delivered</p><p className="font-semibold">{fmtInt(mcTotals.delivered)}</p></div>
                <div><p className="text-xs text-gray-500">Open rate</p><p className="font-semibold">{fmtPct(div(mcTotals.opens, mcTotals.delivered))}</p></div>
                <div><p className="text-xs text-gray-500">Click rate</p><p className="font-semibold">{fmtPct(div(mcTotals.clicks, mcTotals.delivered))}</p></div>
              </div>
              <p className="text-xs text-gray-400">Selected range · delivered emails count toward Email impressions.</p>
            </div>
          ) : (
            <div className="space-y-1 text-sm text-gray-600">
              <p>Add <code className="rounded bg-gray-100 px-1 text-xs">MAILCHIMP_API_KEY</code> to the Vercel project (Production), then redeploy.</p>
              {sources.mailchimp.error && <p className="text-xs text-red-700">{sources.mailchimp.error}</p>}
            </div>
          )}
        </Card>
      </div>

      {sources.mailchimp.connected && mailchimp.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-md border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2.5">Mailchimp month</th>
                {['Campaigns', 'Sent', 'Delivered', 'Unique opens', 'Open rate', 'Unique clicks', 'Click rate', 'Unsubs'].map((h) => <th key={h} className="px-4 py-2.5 text-right">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {[...mailchimp].reverse().map((m) => (
                <tr key={m.month}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{monthLabel(m.month, true)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtInt(m.campaigns)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtInt(m.sent)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtInt(m.delivered)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtInt(m.uniqueOpens)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtPct(div(m.uniqueOpens, m.delivered))}</td>
                  <td className="px-4 py-2.5 text-right">{fmtInt(m.uniqueClicks)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtPct(div(m.uniqueClicks, m.delivered))}</td>
                  <td className="px-4 py-2.5 text-right">{fmtInt(m.unsubscribes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
