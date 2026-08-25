'use client';

// app/admin/analytics/urls/page.tsx
//
// URL rollup analytics dashboard. Aggregates magazine_hotspot_clicks by
// outbound URL (domain + path, query stripped) so you can measure
// publisher / partner / any destination link without an advertisers row.
//
// Sibling of /admin/analytics/advertiser/[id] — same click event source,
// different grouping key. Useful for RealtyLine masthead, ABoR /
// UnlockMLS, campaign landing pages, etc.
//
// Data source: /api/admin/analytics/urls

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';

interface UrlRollupRow {
  url_key: string;
  display_url: string;
  clicks: number;
  unique_sessions: number;
  magazines: number;
  hotspots: number;
  first_click_at: string | null;
  last_click_at: string | null;
}

interface UrlRollupResponse {
  rows: UrlRollupRow[];
  total: number;
  page: number;
  pageSize: number;
  from: string;
  to: string;
}

type PublicationFilter = 'all' | 'austin' | 'san_antonio';

// Local date helpers — the API takes ISO strings, but the <input type="date">
// value is YYYY-MM-DD in the browser's local timezone. We convert both ways.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const PAGE_SIZE = 50;

export default function UrlAnalyticsPage() {
  const [from, setFrom] = useState<string>(daysAgoIso(30));
  const [to, setTo] = useState<string>(todayIso());
  const [publication, setPublication] = useState<PublicationFilter>('all');
  const [magazineId, setMagazineId] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const [data, setData] = useState<UrlRollupResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Manual refresh nonce: bump to force a refetch with the same filters.
  const [nonce, setNonce] = useState<number>(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', new Date(`${from}T00:00:00`).toISOString());
    p.set('to', new Date(`${to}T23:59:59`).toISOString());
    if (publication !== 'all') p.set('publication', publication);
    if (magazineId.trim()) p.set('magazineId', magazineId.trim());
    p.set('page', String(page));
    p.set('pageSize', String(PAGE_SIZE));
    return p.toString();
  }, [from, to, publication, magazineId, page]);

  // Fetch on filter change or manual refresh. All setState happens inside
  // async callbacks (never synchronously in the effect body) to satisfy the
  // repo's react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/analytics/urls?${query}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`Request failed (${res.status}) ${txt.slice(0, 200)}`);
        }
        return res.json() as Promise<UrlRollupResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setError(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setData(null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query, nonce]);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const totalClicks = useMemo(
    () => (data?.rows ?? []).reduce((s, r) => s + r.clicks, 0),
    [data],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageTitle size="md">URL analytics</PageTitle>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        Click totals grouped by outbound URL. Includes every clickable hotspot
        regardless of advertiser link status — useful for publisher, partner,
        and non-CRM destinations.
      </p>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">From</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">To</label>
          <input
            type="date"
            value={to}
            min={from}
            max={todayIso()}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Publication</label>
          <select
            value={publication}
            onChange={(e) => { setPublication(e.target.value as PublicationFilter); setPage(1); }}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="austin">RealtyLine (Austin)</option>
            <option value="san_antonio">Newsline (San Antonio)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Magazine ID</label>
          <input
            type="number"
            value={magazineId}
            placeholder="optional"
            onChange={(e) => { setMagazineId(e.target.value); setPage(1); }}
            className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => { setFrom(daysAgoIso(30)); setTo(todayIso()); setPublication('all'); setMagazineId(''); setPage(1); }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Reset
          </button>
          <button
            onClick={refresh}
            className="rounded bg-[#7c3aed] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#6d28d9]"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      {data && !loading && !error && (
        <div className="mb-3 text-sm text-gray-600">
          {data.total.toLocaleString()} unique URLs · {totalClicks.toLocaleString()} clicks on this page
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">URL</th>
              <th className="px-3 py-2 text-right">Clicks</th>
              <th className="px-3 py-2 text-right">Sessions</th>
              <th className="px-3 py-2 text-right">Magazines</th>
              <th className="px-3 py-2 text-right">Hotspots</th>
              <th className="px-3 py-2 text-left">Last click</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading…</td>
              </tr>
            )}
            {error && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-red-600">{error}</td>
              </tr>
            )}
            {!loading && !error && data && data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No click events in this range.
                </td>
              </tr>
            )}
            {!loading && !error && data && data.rows.map((r) => (
              <tr key={r.url_key} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <a
                    href={r.display_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-[#7c3aed] hover:underline"
                  >
                    {r.url_key || '(empty)'}
                  </a>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{r.clicks.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.unique_sessions.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.magazines}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.hotspots}</td>
                <td className="px-3 py-2 text-gray-600">{formatDateTime(r.last_click_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > data.pageSize && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-gray-600">
            Page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
