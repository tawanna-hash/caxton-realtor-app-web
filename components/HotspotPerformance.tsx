// components/HotspotPerformance.tsx
//
// Phase 6c: "Hotspot performance" section for /admin/analytics. Two ranking
// tables (top advertisers, top hotspots) over the last 30 days. Self-contained
// fetch + skeleton so it loads independently of the PostHog report.
//
// Data source: /api/admin/analytics/hotspot-performance

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TopAdvertiser {
  name: string;
  clicks: number;
  hotspots: number;
}
interface TopHotspot {
  id: number;
  label: string | null;
  advertiserName: string | null;
  publicationLabel: string;
  issueLabel: string;
  page: number;
  clicks: number;
}
interface PerfData {
  topAdvertisers: TopAdvertiser[];
  topHotspots: TopHotspot[];
}

export default function HotspotPerformance() {
  const [data, setData] = useState<PerfData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/analytics/hotspot-performance', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<PerfData>;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Hotspot performance</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Magazine hotspot clicks, last 30 days. Independent of PostHog.
          </p>
        </div>
        <Link
          href="/admin/crm"
          className="text-[10px] text-blue-600 uppercase tracking-wider self-start sm:self-auto hover:underline"
        >
          All partners
        </Link>
      </div>

      {error ? (
        <p className="text-[11px] text-amber-700">
          Hotspot performance unavailable ({error}). The rest of the page is unaffected.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top advertisers */}
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Top partners</p>
            {loading ? (
              <TableSkeleton rows={5} cols={3} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left font-medium pb-2">Partner</th>
                    <th className="text-right font-medium pb-2">Hotspots</th>
                    <th className="text-right font-medium pb-2">Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.topAdvertisers.map((a) => (
                    <tr key={a.name} className="hover:bg-gray-50">
                      <td className="py-2.5 pl-2 truncate max-w-[180px]" title={a.name}>{a.name}</td>
                      <td className="py-2.5 text-right font-mono text-gray-500">{a.hotspots}</td>
                      <td className="py-2.5 text-right font-mono pr-2">{a.clicks.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                  {!data?.topAdvertisers.length ? (
                    <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-xs">No clicks in window</td></tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>

          {/* Top hotspots */}
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Top hotspots</p>
            {loading ? (
              <TableSkeleton rows={5} cols={2} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left font-medium pb-2">Hotspot</th>
                    <th className="text-right font-medium pb-2">Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.topHotspots.map((h) => {
                    const primary = h.advertiserName || h.label || `Hotspot #${h.id}`;
                    const context = `${h.publicationLabel} · ${h.issueLabel} · p.${h.page}`;
                    return (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="py-2.5 pl-2">
                          <div className="truncate max-w-[220px]" title={primary}>{primary}</div>
                          <div className="text-[10px] text-gray-400 truncate max-w-[220px]" title={context}>{context}</div>
                        </td>
                        <td className="py-2.5 text-right font-mono pr-2 align-top">{h.clicks.toLocaleString('en-US')}</td>
                      </tr>
                    );
                  })}
                  {!data?.topHotspots.length ? (
                    <tr><td colSpan={2} className="py-4 text-center text-gray-400 text-xs">No clicks in window</td></tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className={`h-3 bg-gray-200 rounded-md ${j === 0 ? 'flex-1' : 'w-12'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
