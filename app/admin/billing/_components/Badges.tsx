'use client';

// app/admin/billing/_components/Badges.tsx
//
// Small display-only pills/badges used across billing lists.

import type { KpiAccent } from './types';

export function Kpi({
  label, value, accent, onClick,
}: {
  label: string;
  value: string;
  accent?: KpiAccent;
  onClick?: () => void;
}) {
  const borderCls = accent === 'rose' ? 'border-l-4 border-l-rose-500'
    : accent === 'amber' ? 'border-l-4 border-l-amber-500'
    : accent === 'emerald' ? 'border-l-4 border-l-emerald-500'
    : accent === 'blue' ? 'border-l-4 border-l-blue-500'
    : '';
  return (
    <div
      className={`rounded-md border border-gray-200 bg-white p-4 ${borderCls} ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
      onClick={onClick}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{label}</div>
      <div className="text-2xl text-gray-900 mt-1">{value}</div>
    </div>
  );
}

export function StatusPill({
  value, options,
}: {
  value: string;
  options: { value: string; label: string; tone: string }[];
}) {
  const opt = options.find((o) => o.value === value) ?? options[0];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${opt.tone}`}>{opt.label}</span>;
}

export function DaysBadge({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-400 text-xs">—</span>;
  const cls = days < 0
    ? 'bg-rose-100 text-rose-700 border-rose-300'
    : days <= 14
      ? 'bg-amber-100 text-amber-700 border-amber-300'
      : 'bg-emerald-100 text-emerald-700 border-emerald-300';
  const label = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`;
  return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold border ${cls}`}>{label}</span>;
}

export function ReminderStatusBadge({ status }: { status: string }) {
  const cls = status === 'Pending'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : status === 'Completed'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{status}</span>;
}

export function PaidStamp({ paidAt }: { paidAt: string | null }) {
  return (
    <span
      title={paidAt ? `Paid ${new Date(paidAt).toLocaleDateString()}` : 'Paid'}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] border-2 border-emerald-600 text-emerald-700 bg-emerald-50"
      style={{ transform: 'rotate(-2deg)' }}
    >
      ✓ Paid
    </span>
  );
}

export function UnpaidBadge({ overdue }: { overdue: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] border ${
        overdue
          ? 'border-amber-500 text-amber-700 bg-amber-50'
          : 'border-gray-300 text-gray-600 bg-gray-50'
      }`}
    >
      {overdue ? 'Overdue' : 'Unpaid'}
    </span>
  );
}
