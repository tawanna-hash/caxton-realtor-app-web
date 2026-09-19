'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export default function InsightsPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const first = total ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700">
      <span>{total ? `${first}–${last} of ${total}` : '0 results'}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows
          <select
            aria-label="Rows per page"
            className="h-8 rounded border border-gray-300 bg-white px-2 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        <button
          type="button"
          aria-label="Previous page"
          className="rounded p-1.5 hover:bg-gray-200 disabled:opacity-40"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          className="rounded p-1.5 hover:bg-gray-200 disabled:opacity-40"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
