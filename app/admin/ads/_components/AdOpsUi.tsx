'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export const AD_OPS_CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100';

export const AD_OPS_PRIMARY =
  'inline-flex h-9 items-center justify-center gap-2 rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-50';

export const AD_OPS_SECONDARY =
  'inline-flex h-9 items-center justify-center gap-2 rounded border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-100';

export function AdOpsPagination({
  count,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  count: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, totalPages);
  const first = count ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, count);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-2.5 text-xs text-gray-700">
      <span>{count ? `${first}–${last} of ${count}` : '0 results'}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows
          <select
            className="h-7 rounded border border-gray-300 bg-white px-1.5"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
          disabled={currentPage === 1}
          onClick={() => onPageChange(1)}
        >
          First
        </button>
        <button
          type="button"
          aria-label="Previous page"
          className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center tabular-nums">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          Last
        </button>
      </div>
    </div>
  );
}

export function AdOpsMetrics({
  items,
  label,
}: {
  items: Array<{ label: string; value: string | number; detail?: string }>;
  label: string;
}) {
  return (
    <section aria-label={label} className="grid grid-cols-2 border-y border-gray-200 bg-white sm:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`min-w-0 px-4 py-3 ${index ? 'border-l border-gray-200' : ''}`}
        >
          <div className="truncate text-lg font-semibold leading-tight tabular-nums text-gray-900">
            {item.value}
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-600">
            {item.label}{item.detail ? ` · ${item.detail}` : ''}
          </div>
        </div>
      ))}
    </section>
  );
}
