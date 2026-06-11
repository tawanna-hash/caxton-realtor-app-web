// components/KpiStrip.tsx
//
// Phase 6b: "at a glance" cross-system KPI strip for the top of /admin/analytics.
// Self-contained — owns its own fetch + skeleton + error state so it renders
// instantly and independently of the (slow) PostHog report below it.
//
// Data source: /api/admin/analytics/overview
//   - subscribers (from the droplet API)
//   - magazine hotspot clicks (30d), published hotspots, linked advertisers,
//     and the top advertiser by clicks (all from Neon)

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface OverviewData {
  subscribers: { total: number | null; austin: number | null; san_antonio: number | null };
  magazineClicks30d: number;
  publishedHotspots: number;
  linkedAdvertisers: number;
  topAdvertiser: { name: string; clicks: number } | null;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

export default function KpiStrip() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/analytics/overview', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<OverviewData>;
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

  const subsSub = data?.subscribers
    ? `${fmt(data.subscribers.austin)} Austin · ${fmt(data.subscribers.san_antonio)} SA`
    : '';

  return (
    <section aria-label="At a glance" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile
        label="Subscribers"
        value={fmt(data?.subscribers.total)}
        sub={subsSub}
        loading={loading}
        href="/admin/subscribers"
      />
      <Tile
        label="Magazine clicks · 30d"
        value={fmt(data?.magazineClicks30d)}
        sub={`${fmt(data?.publishedHotspots)} published hotspots`}
        loading={loading}
        href="/admin/magazines"
      />
      <Tile
        label="Top advertiser · 30d"
        value={data?.topAdvertiser ? data.topAdvertiser.name : '—'}
        sub={data?.topAdvertiser ? `${fmt(data.topAdvertiser.clicks)} clicks` : 'No clicks yet'}
        loading={loading}
        href="/admin/crm"
        valueSmall
      />
      <Tile
        label="Linked advertisers"
        value={fmt(data?.linkedAdvertisers)}
        sub="With ≥1 tracked hotspot"
        loading={loading}
        href="/admin/crm"
      />
      {error ? (
        <p className="col-span-2 lg:col-span-4 text-[11px] text-amber-700">
          Overview unavailable ({error}). PostHog report below is unaffected.
        </p>
      ) : null}
    </section>
  );
}

function Tile({
  label, value, sub, loading, href, valueSmall,
}: {
  label: string;
  value: string;
  sub: string;
  loading: boolean;
  href: string;
  valueSmall?: boolean;
}) {
  const inner = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 h-full transition hover:border-gray-300 hover:shadow-sm">
      {loading ? (
        <div className="animate-pulse">
          <div className="h-2.5 bg-gray-200 rounded w-24" />
          <div className="h-7 bg-gray-200 rounded w-20 mt-2" />
          <div className="h-2 bg-gray-200 rounded w-28 mt-2" />
        </div>
      ) : (
        <>
          <p className="text-[11px] font-medium text-gray-500 truncate">{label}</p>
          <p
            className={`font-semibold mt-1 tracking-tight text-gray-900 truncate ${
              valueSmall ? 'text-lg' : 'text-2xl'
            }`}
            title={value}
          >
            {value}
          </p>
          <p className="text-[10px] text-gray-400 mt-1 truncate" title={sub}>{sub}</p>
        </>
      )}
    </div>
  );
  return (
    <Link href={href} className="block">
      {inner}
    </Link>
  );
}
