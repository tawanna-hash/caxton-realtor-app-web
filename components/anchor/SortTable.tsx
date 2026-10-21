'use client';

import { useMemo, useState } from 'react';
import SortCaret from '@/components/anchor/SortCaret';

type Val = string | number | null | undefined;
export type SortCol<T> = { key?: string; label: React.ReactNode; className?: string; get?: (r: T) => Val };

// Table with a sortable header on every labelled column (small ▴ / ▾ chevron, same as the Clients page).
// `children` receives the sorted rows (optionally windowed with offset/limit for paged tables).
export default function SortTable<T>({ rows, cols, className, offset = 0, limit, children }: {
  rows: T[]; cols: Array<SortCol<T>>; className?: string; offset?: number; limit?: number; children: (rows: T[]) => React.ReactNode;
}) {
  const [s, setS] = useState<{ i: number; dir: 'asc' | 'desc' } | null>(null);
  const sorted = useMemo(() => {
    const c = s ? cols[s.i] : null;
    if (!s || !c?.get) return rows;
    const get = c.get;
    const m = s.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null || x === '') return y == null || y === '' ? 0 : 1;
      if (y == null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })) * m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, s]);
  const view = limit != null ? sorted.slice(offset, offset + limit) : sorted;
  return (
    <table className={className}>
      <thead>
        <tr>
          {cols.map((c, i) => {
            const on = s?.i === i;
            return (
              <th key={i} className={c.className} aria-sort={on ? (s!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.get ? (
                  <button type="button" onClick={() => setS(on ? { i, dir: s!.dir === 'asc' ? 'desc' : 'asc' } : { i, dir: 'asc' })} style={{ border: 0, background: 'transparent', padding: 0 }} className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--ds-body)]">
                    {c.label}<SortCaret dir={on ? s!.dir : undefined} />
                  </button>
                ) : c.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>{children(view)}</tbody>
    </table>
  );
}
