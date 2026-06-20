'use client';

// app/admin/reports/_components/ReportPicker.tsx
//
// Searchable picker for the Articles and Events tabs of the report builder.
// Replaces the native <select> with a scannable, filterable list so the
// admin can see many rows at once and narrow them by typing.
//
// Design goals
// - At-a-glance: top 30 rows visible by default in a 360px tall card; scroll
//   to see the rest. No need to expand a dropdown to start scanning.
// - Filter as you type: matches across title and publication, case-insensitive.
// - Keyboard friendly: Up/Down/Enter navigation, Escape to clear search.
// - Pub chip on the left so the eye can group by publication.
// - Engagement metric on the right so the admin can sort by impact mentally.
//
// Generic over the row shape — Articles tab passes opens, Events tab passes
// clicks + regs. The caller provides the metric label rendered on each row.

import { useEffect, useMemo, useRef, useState } from 'react';

export type PickerItem = {
  id: string;
  title: string;
  pub: string | null;
  metric: string; // e.g. "16 opens" or "4 clicks, 0 regs"
};

type Props = {
  items: PickerItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
};

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export default function ReportPicker({
  items,
  selectedId,
  onSelect,
  placeholder = 'Search by title or publication\u2026',
  emptyLabel = 'No matches.',
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    return items.filter((it) => {
      const hay = normalize(`${it.pub ?? ''} ${it.title}`);
      // simple AND over space-separated terms so "abrep elissa" matches both
      return q.split(/\s+/).every((term) => hay.includes(term));
    });
  }, [items, query]);

  // Scroll the active row into view as user arrows through.
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLButtonElement>(
      `[data-row-idx="${activeIdx}"]`,
    );
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min((i < 0 ? -1 : i) + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[activeIdx];
      if (target) onSelect(target.id);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  }

  const selected = items.find((it) => it.id === selectedId) ?? null;

  return (
    <div className="w-full max-w-2xl">
      {/* Search input + Clear */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Reset active row to the top whenever the filter changes so
            // arrow-keys start from the first match.
            setActiveIdx(0);
          }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          aria-label="Search list"
          className="w-full border border-gray-300 rounded-md px-3 py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D]/30 focus:border-[#301D5D]"
        />
        {/* Magnifying glass */}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
        >
          <path
            fill="currentColor"
            d="M8 3a5 5 0 1 0 3.196 8.86l3.472 3.472a1 1 0 0 0 1.414-1.414l-3.472-3.472A5 5 0 0 0 8 3Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
          />
        </svg>
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveIdx(0);
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
              <path
                fill="currentColor"
                d="M10 8.586 5.707 4.293a1 1 0 0 0-1.414 1.414L8.586 10l-4.293 4.293a1 1 0 1 0 1.414 1.414L10 11.414l4.293 4.293a1 1 0 0 0 1.414-1.414L11.414 10l4.293-4.293a1 1 0 0 0-1.414-1.414L10 8.586Z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Result counter + selection hint */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>
          {filtered.length} of {items.length}{' '}
          {items.length === 1 ? 'result' : 'results'}
        </span>
        {selected && (
          <span className="truncate ml-3 max-w-[60%] text-gray-700" title={selected.title}>
            Selected: <span className="font-medium text-gray-900">{selected.title}</span>
          </span>
        )}
      </div>

      {/* Scannable list */}
      <div
        ref={listRef}
        className="mt-2 border border-gray-200 rounded-md bg-white max-h-[360px] overflow-y-auto divide-y divide-gray-100"
        role="listbox"
        aria-label="Pickable list"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500 text-center">{emptyLabel}</div>
        ) : (
          filtered.map((it, idx) => {
            const isSelected = it.id === selectedId;
            const isActive = idx === activeIdx;
            return (
              <button
                key={it.id}
                type="button"
                data-row-idx={idx}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => onSelect(it.id)}
                className={[
                  'w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors',
                  isSelected
                    ? 'bg-[#301D5D]/5'
                    : isActive
                      ? 'bg-gray-50'
                      : 'bg-white hover:bg-gray-50',
                ].join(' ')}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {/* Pub chip */}
                {it.pub ? (
                  <span
                    className={[
                      'shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
                      it.pub.toLowerCase() === 'realtyline'
                        ? 'bg-amber-100 text-amber-900'
                        : it.pub.toLowerCase() === 'newsline'
                          ? 'bg-sky-100 text-sky-900'
                          : 'bg-gray-100 text-gray-700',
                    ].join(' ')}
                  >
                    {it.pub}
                  </span>
                ) : (
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500">
                    no pub
                  </span>
                )}

                {/* Title */}
                <span className="min-w-0 flex-1 text-sm text-gray-900 truncate" title={it.title}>
                  {it.title}
                </span>

                {/* Metric */}
                <span className="shrink-0 text-xs text-gray-500 tabular-nums">
                  {it.metric}
                </span>

                {/* Selected check */}
                {isSelected && (
                  <svg
                    viewBox="0 0 20 20"
                    className="shrink-0 w-4 h-4 text-[#301D5D]"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="m8.227 13.227-3.182-3.182 1.414-1.414 1.768 1.768 5.293-5.293 1.414 1.414-6.707 6.707Z"
                    />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
