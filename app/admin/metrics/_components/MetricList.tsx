// app/admin/metrics/_components/MetricList.tsx
//
// Universal responsive list for /admin/metrics tables.
//   - On ≥sm viewports: renders as a real <table> so column alignment survives.
//   - On <sm viewports: renders as a stacked card list. Primary label on top,
//     right-aligned bold value; secondary cells (up to two) wrap as small
//     text below the primary label.
//
// This keeps ALL data visible on mobile — nothing is hidden — but drops the
// dense column layout that requires horizontal scroll to read.

import * as React from 'react';

export type MetricColumn<T> = {
  /** Column header on desktop. Also used on mobile only for the primary
   *  cell — secondaries are inline without a label. */
  header: string;
  /** Render fn returning cell content. */
  render: (row: T) => React.ReactNode;
  /** Layout role. `primary` sits on top of the mobile card (left).
   *  `value` sits on the right of the mobile card, right-aligned, bold.
   *  `secondary` cells are shown as smaller muted text below primary. */
  role: 'primary' | 'secondary' | 'value';
  /** Optional Tailwind classes for the desktop <td>/<th>. */
  className?: string;
  /** Text alignment on desktop. Default 'left' for primary/secondary, 'right' for value. */
  align?: 'left' | 'right';
};

export function MetricList<T>({
  rows,
  columns,
  keyFn,
  emptyMessage = 'No data yet.',
}: {
  rows: T[];
  columns: MetricColumn<T>[];
  keyFn: (row: T, index: number) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  const primary = columns.find((c) => c.role === 'primary');
  const value = columns.find((c) => c.role === 'value');
  const secondaries = columns.filter((c) => c.role === 'secondary');

  return (
    <>
      {/* Desktop / tablet: real table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500">
              {columns.map((c) => {
                const align =
                  c.align ?? (c.role === 'value' ? 'right' : 'left');
                return (
                  <th
                    key={c.header}
                    className={`pb-2 font-medium text-${align} ${c.className ?? ''}`}
                  >
                    {c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={keyFn(row, i)} className="border-t border-gray-100">
                {columns.map((c) => {
                  const align =
                    c.align ?? (c.role === 'value' ? 'right' : 'left');
                  return (
                    <td
                      key={c.header}
                      className={`py-2 text-${align} ${c.className ?? ''}`}
                    >
                      {c.render(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="sm:hidden divide-y divide-gray-100">
        {rows.map((row, i) => (
          <li key={keyFn(row, i)} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {primary && (
                  <div className="text-sm text-gray-900 truncate">
                    {primary.render(row)}
                  </div>
                )}
                {secondaries.length > 0 && (
                  <div className="mt-0.5 text-xs text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5">
                    {secondaries.map((c) => (
                      <span key={c.header} className="truncate">
                        {c.render(row)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {value && (
                <div className="text-sm tabular-nums font-medium text-gray-900 whitespace-nowrap">
                  {value.render(row)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
