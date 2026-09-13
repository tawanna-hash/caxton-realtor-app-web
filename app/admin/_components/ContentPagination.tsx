'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  count: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function ContentPagination({
  count,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.min(page, totalPages);
  const first = count ? (safePage - 1) * pageSize + 1 : 0;
  const last = Math.min(safePage * pageSize, count);

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-2.5 text-xs text-gray-700">
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
          aria-label="Previous page"
          className="rounded p-1 hover:bg-gray-200 disabled:opacity-35"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-14 text-center tabular-nums">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          className="rounded p-1 hover:bg-gray-200 disabled:opacity-35"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </footer>
  );
}
