'use client';

// Recharts wrappers for /admin/marketing-performance. Lazy-loaded by the
// page so the admin first paint isn't blocked by the charting bundle.

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export type Series = { key: string; label: string; color: string; dashed?: boolean };
type Row = Record<string, string | number | null>;
type Fmt = (v: number) => string;

const AXIS = { stroke: '#7A7787', fontSize: 11, tickLine: false } as const;
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #E6E5EC',
  borderRadius: 6,
  fontSize: 12,
} as const;

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0;
}

export function StackedBars({ data, series, fmt, height = 280 }: { data: Row[]; series: Series[]; fmt: Fmt; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="label" {...AXIS} axisLine={{ stroke: '#E6E5EC' }} />
        <YAxis {...AXIS} axisLine={false} width={56} tickFormatter={(v) => fmt(num(v))} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(48,29,93,0.05)' }}
          formatter={(value, name) => [fmt(num(value)), series.find((s) => s.key === name)?.label ?? String(name)]}
        />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} maxBarSize={36}
            radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, series, fmt, height = 280, legend = true }: { data: Row[]; series: Series[]; fmt: Fmt; height?: number; legend?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="label" {...AXIS} axisLine={{ stroke: '#E6E5EC' }} />
        <YAxis {...AXIS} axisLine={false} width={56} tickFormatter={(v) => fmt(num(v))} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value, name) => [value == null ? '—' : fmt(num(value)), series.find((s) => s.key === name)?.label ?? String(name)]}
        />
        {legend && (
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            formatter={(v: string) => series.find((s) => s.key === v)?.label ?? v} />
        )}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined} dot={data.length <= 6 ? { r: 3 } : false}
            activeDot={{ r: 4 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, fmt, height = 200 }: { data: Array<{ key: string; label: string; value: number; color: string }>; fmt: Fmt; height?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const shown = total > 0 ? data : [{ key: 'none', label: 'No data', value: 1, color: '#E6E5EC' }];
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={shown} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="95%" paddingAngle={total > 0 ? 1 : 0} stroke="none" isAnimationActive>
            {shown.map((d) => <Cell key={d.key} fill={d.color} />)}
          </Pie>
          {total > 0 && (
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [`${fmt(num(value))} (${((num(value) / total) * 100).toFixed(1)}%)`, String(name)]} />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums text-gray-900">{fmt(total)}</span>
        <span className="text-[11px] text-gray-500">Total</span>
      </div>
    </div>
  );
}

export function HBars({ data, fmt, height = 220 }: { data: Array<{ label: string; value: number; color: string }>; fmt: Fmt; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" {...AXIS} axisLine={false} tickFormatter={(v) => fmt(num(v))} />
        <YAxis type="category" dataKey="label" {...AXIS} axisLine={false} width={64} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(48,29,93,0.05)' }} formatter={(value) => [fmt(num(value)), '']} />
        <Bar dataKey="value" maxBarSize={22} radius={[0, 3, 3, 0]}>
          {data.map((d) => <Cell key={d.label} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
