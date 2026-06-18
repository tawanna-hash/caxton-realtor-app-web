// app/r/advertiser/[slug]/DailyClicksAreaChart.tsx
//
// Extracted from PublicReportClient so recharts (~320 kB) is loaded
// lazily via next/dynamic on the public advertiser report page.
// Only the chart code lives here; the parent owns layout, data, theme.

'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export type DailyClickPoint = { date: string; clicks: number };

type Props = {
  data: DailyClickPoint[];
  primaryColor: string;
  gradientId: string;
  formatDate: (iso: string) => string;
};

export default function DailyClicksAreaChart({
  data,
  primaryColor,
  gradientId,
  formatDate,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity={0.4} />
            <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickFormatter={formatDate}
          minTickGap={20}
        />
        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
        <Tooltip
          labelFormatter={(label) => formatDate(String(label))}
          contentStyle={{
            fontSize: 12,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
          }}
        />
        <Area
          type="monotone"
          dataKey="clicks"
          stroke={primaryColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
