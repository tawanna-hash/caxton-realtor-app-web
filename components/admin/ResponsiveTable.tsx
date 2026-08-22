// components/admin/ResponsiveTable.tsx
//
// General-purpose responsive list for admin surfaces.
//   - On ≥sm viewports: real <table> so column alignment survives.
//   - On <sm viewports: stacked labeled cards. Data is laid out inside each
//     card via per-column `mobile` roles that place content into named slots
//     (primary/meta/label/value/footer/hidden).
//
// Feature parity with the wide grid-cols-N + <table> patterns replaced across
// /admin: bulk-select checkboxes, click-to-open rows, per-column truncation,
// arbitrary action clusters, and status pills.
//
// This is the *only* primitive that new admin list code should reach for.
// Legacy MetricList (metrics-specific value/secondary layout) still lives in
// app/admin/metrics/_components/MetricList.tsx for historical rows.

import * as React from 'react';

/** Placement in the mobile card. */
export type MobileRole =
  /** Big text at the top of the card body. Multiple primaries are stacked. */
  | 'primary'
  /** Small muted meta below primary (inline, wrapped). */
  | 'meta'
  /** Labeled row in the dl grid ({label}: {value(cell)}). */
  | 'label'
  /** Labeled row in the dl grid, but the value is rendered bold. */
  | 'value'
  /** Footer row below the dl (typically action buttons). */
  | 'footer'
  /** Not shown on mobile. */
  | 'hidden';

export type ResponsiveColumn<T> = {
  /** Stable key for React and for looking up the column. */
  key: string;
  /** Table header text on desktop; also used as the mobile dl label
   *  unless overridden by `mobileLabel`. */
  header: React.ReactNode;
  /** Renders the cell content. */
  render: (row: T, index: number) => React.ReactNode;
  /** Desktop <th>/<td> classes. */
  className?: string;
  /** Desktop <th> classes (override for header only). */
  headerClassName?: string;
  /** Desktop text alignment. Default: left; 'value' role defaults to right. */
  align?: 'left' | 'right' | 'center';
  /** Which mobile slot this column renders into. Default: 'label'. */
  mobile?: MobileRole;
  /** Optional short label for mobile dl; falls back to header. */
  mobileLabel?: React.ReactNode;
  /** Optional column-span on desktop when the parent is a grid, not a real
   *  table. Ignored by ResponsiveTable — kept for backwards-compat shims. */
  colSpan?: number;
};

export type BulkSelect<T> = {
  /** Set of row keys currently selected. */
  selected: Set<string>;
  /** Called with (rowKey, next) when a row checkbox is toggled. */
  onToggle: (rowKey: string, next: boolean) => void;
  /** Called with (next) when the header "select all visible" checkbox is toggled. */
  onToggleAll: (next: boolean) => void;
  /** Optional: total selectable rows (used to compute the header checkbox
   *  indeterminate state). Defaults to rows.length. */
  totalRows?: number;
  /** Optional aria label for the header checkbox. */
  ariaLabelAll?: string;
  /** Optional per-row disabled predicate. */
  rowDisabled?: (row: T) => boolean;
};

export type ResponsiveTableProps<T> = {
  rows: T[];
  columns: ResponsiveColumn<T>[];
  keyFn: (row: T, index: number) => string;
  /** Optional: bulk-select controls. When provided a checkbox column is added
   *  to the leftmost desktop column and to the left of every mobile card. */
  bulkSelect?: BulkSelect<T>;
  /** Optional: called when a row is clicked (desktop OR mobile). If provided
   *  the row is styled as interactive. */
  onRowClick?: (row: T, index: number) => void;
  /** Optional: predicate for extra row classes on desktop (e.g. paid highlight). */
  rowClassName?: (row: T, index: number) => string | undefined;
  /** Optional: mobile card extra classes per row. */
  mobileCardClassName?: (row: T, index: number) => string | undefined;
  /** Shown when rows is empty. */
  emptyMessage?: React.ReactNode;
  /** Desktop <table> classes. Default 'w-full text-sm'. */
  tableClassName?: string;
  /** Desktop <thead> classes. */
  theadClassName?: string;
  /** Wrap desktop table in an overflow-x-auto scroller (default true). */
  desktopScroll?: boolean;
  /** Optional prefix for aria-label of per-row checkboxes. */
  rowCheckboxAriaPrefix?: string;
};

const alignClass = (a: 'left' | 'right' | 'center' | undefined, isValue: boolean) => {
  const resolved = a ?? (isValue ? 'right' : 'left');
  return resolved === 'right' ? 'text-right' : resolved === 'center' ? 'text-center' : 'text-left';
};

function HeaderCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.currentTarget.checked)}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
    />
  );
}

export function ResponsiveTable<T>(props: ResponsiveTableProps<T>) {
  const {
    rows,
    columns,
    keyFn,
    bulkSelect,
    onRowClick,
    rowClassName,
    mobileCardClassName,
    emptyMessage = 'No rows.',
    tableClassName = 'w-full text-sm',
    theadClassName = 'bg-gray-50 border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500',
    desktopScroll = true,
    rowCheckboxAriaPrefix = 'Select row',
  } = props;

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  // Slot buckets for mobile.
  const bucket = (role: MobileRole) => columns.filter((c) => (c.mobile ?? 'label') === role);
  const primaries = bucket('primary');
  const metas = bucket('meta');
  const labels = [...bucket('label'), ...bucket('value')];
  const footers = bucket('footer');

  // Header select-all state (used both desktop and mobile).
  const total = bulkSelect?.totalRows ?? rows.length;
  const selectedCount = bulkSelect?.selected.size ?? 0;
  const headerChecked = selectedCount > 0 && selectedCount >= total;
  const headerIndeterminate = selectedCount > 0 && !headerChecked;

  const renderHeaderCheckbox = () =>
    bulkSelect ? (
      <HeaderCheckbox
        checked={headerChecked}
        indeterminate={headerIndeterminate}
        onChange={(next) => bulkSelect.onToggleAll(next)}
        ariaLabel={bulkSelect.ariaLabelAll ?? 'Select all rows'}
      />
    ) : null;

  const desktop = (
    <table className={tableClassName}>
      <thead className={theadClassName}>
        <tr>
          {bulkSelect && (
            <th className="w-8 px-3 py-2">
              {renderHeaderCheckbox()}
            </th>
          )}
          {columns.map((c) => {
            const isValue = (c.mobile ?? 'label') === 'value';
            return (
              <th
                key={c.key}
                className={`px-3 py-2 font-medium ${alignClass(c.align, isValue)} ${c.headerClassName ?? c.className ?? ''}`}
              >
                {c.header}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, i) => {
          const rk = keyFn(row, i);
          const isSelected = bulkSelect?.selected.has(rk) ?? false;
          const clickable = !!onRowClick;
          const extra = rowClassName?.(row, i) ?? '';
          return (
            <tr
              key={rk}
              className={`${clickable ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-gray-50/60'} ${extra}`}
              onClick={clickable ? (e) => {
                // Don't trigger row click when interacting with a nested control.
                const target = e.target as HTMLElement;
                if (target.closest('input,button,a,select,textarea,label')) return;
                onRowClick!(row, i);
              } : undefined}
            >
              {bulkSelect && (
                <td className="w-8 px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={isSelected}
                    disabled={bulkSelect.rowDisabled?.(row) ?? false}
                    onChange={(e) => bulkSelect.onToggle(rk, e.currentTarget.checked)}
                    aria-label={`${rowCheckboxAriaPrefix} ${rk}`}
                  />
                </td>
              )}
              {columns.map((c) => {
                const isValue = (c.mobile ?? 'label') === 'value';
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2 align-middle ${alignClass(c.align, isValue)} ${c.className ?? ''}`}
                  >
                    {c.render(row, i)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      {/* Desktop / tablet */}
      <div className={`hidden sm:block ${desktopScroll ? 'overflow-x-auto' : ''}`}>
        {desktop}
      </div>

      {/* Mobile: labeled cards */}
      <ul className="sm:hidden divide-y divide-gray-100">
        {bulkSelect && (
          <li className="py-2 px-1 flex items-center gap-2 text-xs text-gray-600">
            {renderHeaderCheckbox()}
            <span>Select all ({bulkSelect.selected.size} of {total})</span>
          </li>
        )}
        {rows.map((row, i) => {
          const rk = keyFn(row, i);
          const isSelected = bulkSelect?.selected.has(rk) ?? false;
          const clickable = !!onRowClick;
          const extra = mobileCardClassName?.(row, i) ?? '';
          return (
            <li
              key={rk}
              className={`py-3 first:pt-0 last:pb-0 ${clickable ? 'cursor-pointer' : ''} ${extra}`}
              onClick={clickable ? (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('input,button,a,select,textarea,label')) return;
                onRowClick!(row, i);
              } : undefined}
            >
              <div className="flex items-start gap-3">
                {bulkSelect && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                    checked={isSelected}
                    disabled={bulkSelect.rowDisabled?.(row) ?? false}
                    onChange={(e) => bulkSelect.onToggle(rk, e.currentTarget.checked)}
                    aria-label={`${rowCheckboxAriaPrefix} ${rk}`}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  {primaries.length > 0 && (
                    <div className="space-y-0.5">
                      {primaries.map((c) => (
                        <div key={c.key} className="text-sm text-gray-900 min-w-0 break-words">
                          {c.render(row, i)}
                        </div>
                      ))}
                    </div>
                  )}
                  {metas.length > 0 && (
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5">
                      {metas.map((c) => (
                        <span key={c.key} className="min-w-0 break-words">
                          {c.render(row, i)}
                        </span>
                      ))}
                    </div>
                  )}
                  {labels.length > 0 && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      {labels.map((c) => {
                        const isValue = (c.mobile ?? 'label') === 'value';
                        return (
                          <React.Fragment key={c.key}>
                            <dt className="text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {c.mobileLabel ?? c.header}
                            </dt>
                            <dd className={`text-right min-w-0 break-words ${isValue ? 'font-medium text-gray-900' : 'text-gray-800'}`}>
                              {c.render(row, i)}
                            </dd>
                          </React.Fragment>
                        );
                      })}
                    </dl>
                  )}
                  {footers.length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      {footers.map((c) => (
                        <React.Fragment key={c.key}>
                          {c.render(row, i)}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
