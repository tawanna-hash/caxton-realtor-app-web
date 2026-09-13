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
import InsightsPagination from '@/components/admin/InsightsPagination';

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
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  const primary = columns.find((c) => c.role === 'primary');
  const value = columns.find((c) => c.role === 'value');
  const secondaries = columns.filter((c) => c.role === 'secondary');
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      {/* Desktop / tablet: real table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500">
              {columns.map((c) => {
                const align =
                  c.align ?? (c.role === 'value' ? 'right' : 'left');
                return (
                  <th
                    key={c.header}
                    className={`px-2 py-2.5 font-medium text-${align} ${c.className ?? ''}`}
                  >
                    {c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={keyFn(row, i)} className="border-t border-gray-100 hover:bg-orange-50/40">
                {columns.map((c) => {
                  const align =
                    c.align ?? (c.role === 'value' ? 'right' : 'left');
                  return (
                    <td
                      key={c.header}
                      className={`px-2 py-2.5 text-${align} ${c.className ?? ''}`}
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
      <ul className="divide-y divide-gray-100 px-4 sm:hidden">
        {pageRows.map((row, i) => (
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
      {rows.length > 25 && (
        <InsightsPagination
          page={currentPage}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </>
  );
}
