// app/admin/_components/Pager.tsx
//
// Numbered pagination control used by every admin table. Shows the
// current page in bold, Prev/Next bookends that disable at the edges,
// and an ellipsis-aware window of numbered pages so the bar never gets
// wider than ~10 buttons regardless of how many pages exist.
//
// Hydration-safe: pure props in / callback out, no client-only state.
// Renders nothing when totalItems <= pageSize (no need to paginate).

'use client';

import React from 'react';

export type PagerProps = {
  currentPage: number;        // 1-based
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** Optional label rendered to the left of the buttons. */
  summary?: React.ReactNode;
  className?: string;
  /**
   * When provided, the Pager renders a "per page" dropdown next to the
   * summary. Use PAGE_SIZE_OPTIONS for the standard 10/25/50/100/200
   * list. Pass `null` (or omit) to hide the dropdown.
   */
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
};

/**
 * Standard rows-per-page choices for the Mailing Hub child pages.
 * Shared so every page is consistent.
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const;

/** Build a compact page-window like: 1 … 7 8 [9] 10 11 … 42 */
function buildPageList(current: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [];
  const window = 1; // pages on either side of current
  const left = Math.max(2, current - window);
  const right = Math.min(totalPages - 1, current + window);

  pages.push(1);
  if (left > 2) pages.push('ellipsis');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function Pager({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  disabled = false,
  summary,
  className = '',
  pageSizeOptions,
  onPageSizeChange,
}: PagerProps) {
  // Per-page dropdown. Always rendered when both prop hooks are present
  // so it stays visible even when the table fits on one page.
  const showPerPage = !!pageSizeOptions && !!onPageSizeChange;
  const PerPageSelect = showPerPage ? (
    <label className="flex items-center gap-1.5 text-xs text-gray-600">
      <span>Rows</span>
      <select
        value={pageSize}
        disabled={disabled}
        onChange={(e) => onPageSizeChange?.(parseInt(e.target.value, 10))}
        className="text-xs px-1.5 py-1 rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        {pageSizeOptions!.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  ) : null;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrent = Math.min(Math.max(1, currentPage), totalPages);
  const pages = buildPageList(safeCurrent, totalPages);

  if (totalItems <= pageSize) {
    // Still render the summary + per-page so the table footer never
    // visually jumps when the page count drops to 1 after filtering.
    if (!summary && !showPerPage) return null;
    return (
      <div className={`flex items-center justify-between gap-3 flex-wrap ${className}`}>
        <div className="text-xs text-gray-500">{summary}</div>
        {PerPageSelect}
      </div>
    );
  }

  const baseBtn =
    'px-2.5 py-1 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';
  const activeBtn =
    'px-2.5 py-1 text-sm rounded border border-indigo-600 bg-indigo-600 text-white font-semibold';

  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap ${className}`}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-xs text-gray-500">{summary}</div>
        {PerPageSelect}
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <button
          type="button"
          className={baseBtn}
          disabled={disabled || safeCurrent <= 1}
          onClick={() => onPageChange(safeCurrent - 1)}
        >
          Previous
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-1.5 text-gray-400 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === safeCurrent ? 'page' : undefined}
              className={p === safeCurrent ? activeBtn : baseBtn}
              disabled={disabled}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={baseBtn}
          disabled={disabled || safeCurrent >= totalPages}
          onClick={() => onPageChange(safeCurrent + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}

