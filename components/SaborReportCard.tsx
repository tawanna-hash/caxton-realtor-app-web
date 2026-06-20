'use client';

/**
 * SaborReportCard
 * ─────────────────────────────────────────────────────────────────────────
 * "Option B — Data-Forward Card" CTA for the monthly SABOR MLS Summary Report.
 *
 * Two visual variants:
 *   - variant="hero"    → Pinned at top of Newsline San Antonio feed for the first 7 days
 *                        after release. Larger top spacing, no-shadow flat
 *                        treatment to feel native to the feed top.
 *   - variant="inline"  → Same component, slipped between articles every ~5
 *                        items after the hero window expires. Slightly more
 *                        compact.
 *
 * The card is data-driven: a single GET /api/sabor-mls/current call populates
 * the headline number + supporting stats. Falls back to baked-in April 2026
 * numbers from the uploaded report if the API hasn't been seeded yet.
 */

import { useEffect, useState } from 'react';

interface SaborReportData {
  month_label: string;            // e.g. "April 2026"
  released_at: string;             // ISO date
  headline_value: string;          // e.g. "$1.16B"
  headline_delta: string;          // e.g. "▲ 4%"
  headline_delta_direction: 'up' | 'down' | 'flat';
  headline_label: string;          // e.g. "Closed dollar volume · single family · YoY"
  mini_stats: Array<{ value: string; label: string }>; // 4 cells
  page_count?: number;
}

interface Props {
  variant?: 'hero' | 'inline';
}

const FALLBACK: SaborReportData = {
  month_label: 'April 2026',
  released_at: '2026-05-07',
  headline_value: '$1.16B',
  headline_delta: '▲ 4%',
  headline_delta_direction: 'up',
  headline_label: 'Closed dollar volume · single family · YoY',
  mini_stats: [
    { value: '$307K', label: 'Median Price' },
    { value: '87 days', label: 'Avg DOM' },
    { value: '5,713', label: 'New Listings' },
    { value: '16,847', label: 'Active Listings' },
  ],
  page_count: 112,
};

const NEWSLINE = '#301D5D';

export default function SaborReportCard({ variant = 'inline' }: Props) {
  const [data, setData] = useState<SaborReportData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/sabor-mls/current', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j && j.ok && j.report) setData(j.report as SaborReportData);
        else setData(FALLBACK);
      })
      .catch(() => {
        if (alive) setData(FALLBACK);
      });
    return () => {
      alive = false;
    };
  }, []);

  const d = data ?? FALLBACK;

  function trackImpression() {
    try {
      const w = window as unknown as { posthog?: { capture: (e: string, p?: unknown) => void } };
      w.posthog?.capture?.('sabor_mls_card_view', { variant, month: d.month_label });
    } catch {
      // best-effort
    }
  }

  // Impression tracking — fire once per mount when in view
  useEffect(() => {
    const el = document.getElementById(`sabor-card-${variant}`);
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          trackImpression();
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, d.month_label]);

  const deltaColor =
    d.headline_delta_direction === 'down'
      ? '#b91c1c'
      : d.headline_delta_direction === 'flat'
        ? '#6b7280'
        : '#2563eb';

  return (
    <article
      id={`sabor-card-${variant}`}
      className="bg-white border-b border-gray-200"
      aria-label={`SABOR MLS Summary Report ${d.month_label}`}
    >
      <div className="bg-white mx-3 my-3 rounded-md overflow-hidden shadow-sm">
        {/* Brand top strip */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${NEWSLINE} 0%, #7a1f7e 100%)` }} />

        <div className="px-4 pt-4 pb-4">
          {/* Eyebrow row */}
          <div className="flex items-center justify-between mb-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase"
              style={{ background: 'rgba(61,7,64,0.06)', color: NEWSLINE }}
            >
              <span aria-hidden>●</span>
              <span>SABOR Report</span>
            </span>
          </div>

          {/* Title */}
          <h3
            className="text-[20px] leading-tight font-bold text-gray-900 mb-1"
          >
            {d.month_label} MLS Summary
          </h3>
          <p className="text-[13px] text-gray-500 leading-snug mb-4">
            San Antonio market indicators across single-family, multifamily, rental and commercial segments.
          </p>

          {/* Hero stat */}
          <div className="flex items-baseline gap-2.5">
            <div
              className="text-[38px] font-bold leading-none"
              style={{ color: '#2c0530' }}
            >
              {d.headline_value}
            </div>
            <div className="text-[13px] font-bold" style={{ color: deltaColor }}>
              {d.headline_delta}
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500 mt-1.5 mb-3.5">
            {d.headline_label}
          </div>

          {/* 4-cell mini stats */}
          <div
            className="grid grid-cols-2 gap-x-3 gap-y-2.5 py-3 mb-3.5"
            style={{ borderTop: '1px dashed #e5e7eb' }}
          >
            {d.mini_stats.slice(0, 4).map((m) => (
              <div key={m.label}>
                <div
                  className="text-[14px] font-bold text-gray-900"
                >
                  {m.value}
                </div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-gray-500 mt-0.5">
                  {m.label}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </article>
  );
}
