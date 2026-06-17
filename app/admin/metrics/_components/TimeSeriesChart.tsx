'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { TimeSeriesPoint } from '../_types';
import { EVENT_LABELS, EVENT_COLORS } from '../_types';

type Props = {
  data: TimeSeriesPoint[];
};

// Pivots flat rows like { day, event, total } into wide rows like
// { day, inventory_card_clicked: 12, builder_chip_clicked: 8 } that
// Recharts LineChart expects.
function pivotTimeSeries(rows: TimeSeriesPoint[]): Array<Record<string, string | number>> {
  const byDay = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    let bucket = byDay.get(row.day);
    if (!bucket) {
      bucket = { day: row.day };
      byDay.set(row.day, bucket);
    }
    bucket[row.event] = row.total;
  }
  // Fill missing events with 0 for each day so lines don't break
  const allEvents = Object.keys(EVENT_LABELS);
  for (const bucket of byDay.values()) {
    for (const ev of allEvents) {
      if (bucket[ev] == null) bucket[ev] = 0;
    }
  }
  return Array.from(byDay.values()).sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  );
}

function formatDay(d: string): string {
  // Input format: "2026-05-09"; render as "May 9"
  if (!d || d.length < 10) return d;
  const [, m, day] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mi = parseInt(m, 10) - 1;
  return `${months[mi] ?? m} ${parseInt(day, 10)}`;
}

export function TimeSeriesChart({ data }: Props) {
  const pivoted = pivotTimeSeries(data);
  const events = Object.keys(EVENT_LABELS);

  if (pivoted.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-md p-8 text-center">
        <p className="text-sm text-gray-500">
          No event data in the last 7 days yet. Events will appear here as realtors interact with the app.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={pivoted} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatDay}
            stroke="#6b7280"
            fontSize={12}
            tickMargin={8}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tickMargin={8}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '13px',
            }}
            labelFormatter={(label) => formatDay(String(label ?? ''))}
            formatter={(value, name) => [
              typeof value === 'number' ? value.toLocaleString() : String(value),
              EVENT_LABELS[String(name)] ?? String(name),
            ]}
          />
          <Legend
            iconType="line"
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            formatter={(value: string) => EVENT_LABELS[value] ?? value}
          />
          {events.map((ev) => (
            <Line
              key={ev}
              type="monotone"
              dataKey={ev}
              stroke={EVENT_COLORS[ev] ?? '#021D40'}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
