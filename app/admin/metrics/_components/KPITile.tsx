'use client';

import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: number;
  trendPct?: number;     // signed percent (e.g., 12 = +12%, -5 = -5%)
  showTrend?: boolean;
  sublabel?: ReactNode;  // optional small text under the value
};

function formatNumber(n: number): string {
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

function TrendArrow({ pct }: { pct: number }) {
  if (pct === 0) {
    return (
      <span className="inline-flex items-center text-gray-500 text-xs font-medium">
        — 0%
      </span>
    );
  }
  const up = pct > 0;
  const color = up ? 'text-green-600' : 'text-red-600';
  const arrow = up ? '↑' : '↓';
  return (
    <span className={`inline-flex items-center ${color} text-xs font-medium`}>
      {arrow} {Math.abs(pct)}%
    </span>
  );
}

export function KPITile({ label, value, trendPct, showTrend = false, sublabel }: Props) {
  return (
    <div className="min-w-0 border-r border-gray-200 bg-white px-4 py-2 last:border-r-0">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {showTrend && typeof trendPct === 'number' ? <TrendArrow pct={trendPct} /> : null}
      </div>
      <div>
        <p className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">{formatNumber(value)}</p>
        {sublabel ? <p className="mt-0.5 truncate text-xs text-gray-500">{sublabel}</p> : null}
      </div>
    </div>
  );
}
