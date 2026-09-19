'use client';

// Internal-only "who clicked" drill-down for a single event's Register
// short link (/e/[id]). Not part of the client-facing report copy —
// this stays inside the admin dashboard.
//
// Each row is one click from a browser/device, identified by an
// anonymous visitor id (reused from the reader's existing PostHog
// cookie when present). Public event pages don't require login, so
// there is no name or email to show — this is "which device/city
// clicked and when," not "which person clicked."

import { useEffect, useState } from 'react';
import InsightsPagination from '@/components/admin/InsightsPagination';

type ClickRow = {
  occurred_at: string;
  visitor_id: string;
  location: string | null;
  user_agent: string | null;
  referrer: string | null;
};

type ClicksResponse = {
  ok: boolean;
  total_clicks?: number;
  distinct_visitors?: number;
  clicks?: ClickRow[];
  error?: string;
};

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const isIOS = /iPhone|iPad/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const browser = /Chrome/i.test(ua) ? 'Chrome'
    : /Safari/i.test(ua) ? 'Safari'
    : /Firefox/i.test(ua) ? 'Firefox'
    : /Edg/i.test(ua) ? 'Edge'
    : 'Browser';
  const platform = isIOS ? 'iPhone/iPad' : isAndroid ? 'Android' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : 'Unknown OS';
  return `${browser} on ${platform}`;
}

function ClickCard({ click }: { click: ClickRow }) {
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-gray-600" title={click.visitor_id}>{click.visitor_id}</div>
        </div>
        <div className="whitespace-nowrap text-right text-xs text-gray-900">{new Date(click.occurred_at).toLocaleString()}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-gray-500">Approx. location</div>
          <div className="truncate text-gray-700">{click.location || 'Unknown'}</div>
        </div>
        <div>
          <div className="text-gray-500">Device</div>
          <div className="truncate text-gray-700">{summarizeUserAgent(click.user_agent)}</div>
        </div>
      </div>
    </div>
  );
}

export default function EventClickLog({ eventId, days }: { eventId: string; days: number }) {
  const [data, setData] = useState<ClicksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/reports/event-clicks?event_id=${encodeURIComponent(eventId)}&days=${days}`,
          { credentials: 'include' },
        );
        const body = (await res.json().catch(() => null)) as ClicksResponse | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok) {
          setError(body?.error || 'Failed to load click log.');
          setData(null);
          return;
        }
        setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, days]);

  if (!eventId) return null;

  const clicks = data?.clicks ?? [];
  const totalPages = Math.max(1, Math.ceil(clicks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = clicks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Who Clicked (Internal Only)</h2>
          <p className="text-xs text-gray-500 mt-1">
            Public event pages don&apos;t require login, so clicks are tracked by
            anonymous browser/device, not name or email. Not included in client
            report copy.
          </p>
        </div>
        {data?.ok && (
          <div className="text-sm text-gray-600 whitespace-nowrap">
            {data.total_clicks} {data.total_clicks === 1 ? 'click' : 'clicks'} ·{' '}
            {data.distinct_visitors} distinct {data.distinct_visitors === 1 ? 'visitor' : 'visitors'}
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-gray-500 mt-4">Loading click log…</div>}
      {error && <div className="text-sm text-red-700 mt-4">{error}</div>}

      {!loading && !error && data?.clicks && data.clicks.length === 0 && (
        <div className="text-sm text-gray-500 mt-4">
          No registration clicks recorded in this window yet.
        </div>
      )}

      {!loading && !error && data?.clicks && data.clicks.length > 0 && (
        <>
        <div className="divide-y divide-gray-200 md:hidden">
          {pageRows.map((c, i) => (
            <ClickCard key={`${c.visitor_id}-${c.occurred_at}-${i}`} click={c} />
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium">Time</th>
                <th className="pb-2 pr-4 font-medium">Visitor</th>
                <th className="pb-2 pr-4 font-medium">Approx. location</th>
                <th className="pb-2 font-medium">Device</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c, i) => (
                <tr key={`${c.visitor_id}-${c.occurred_at}-${i}`} className="border-b border-gray-100 last:border-0 hover:bg-orange-50/40">
                  <td className="py-2 pr-4 text-gray-900 whitespace-nowrap">
                    {new Date(c.occurred_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-gray-600 font-mono text-xs truncate max-w-[160px]" title={c.visitor_id}>
                    {c.visitor_id}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{c.location || 'Unknown'}</td>
                  <td className="py-2 text-gray-600">{summarizeUserAgent(c.user_agent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {clicks.length > 25 && <InsightsPagination page={currentPage} pageSize={pageSize} total={clicks.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
    </section>
  );
}
