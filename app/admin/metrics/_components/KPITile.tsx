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
    <div className="bg-white border border-gray-200 rounded-md p-4 min-h-[96px] flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
        {showTrend && typeof trendPct === 'number' ? <TrendArrow pct={trendPct} /> : null}
      </div>
      <div>
        <p className="text-2xl font-semibold text-gray-900 mt-2">{formatNumber(value)}</p>
        {sublabel ? <p className="text-xs text-gray-500 mt-1">{sublabel}</p> : null}
      </div>
    </div>
  );
}
