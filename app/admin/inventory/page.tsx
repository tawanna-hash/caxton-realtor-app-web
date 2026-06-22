'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  BuilderInventoryRow,
  Status,
} from '@/lib/builder-inventory';
import EditInventoryModal from '@/components/inventory/EditInventoryModal';

import PageTitle from '@/components/ui/PageTitle';
type Tab = 'pending' | 'active' | 'rejected';

const TAB_LABELS: Record<Tab, string> = {
  pending: 'Pending review',
  active: 'Active',
  rejected: 'Rejected',
};

// Sort-key identifies which row field to sort by; direction picks asc/desc.
// Defaults to newest-first (createdAt desc), matching prior behavior before
// the sort UI landed.
type SortKey =
  | 'createdAt'
  | 'builderName'
  | 'title'
  | 'city'
  | 'publication'
  | 'kind';
type SortDir = 'asc' | 'desc';

// Kind filter — lets the admin narrow the (potentially huge) Active tab
// down to just promotions or just listings without changing the sort.
type KindFilter = 'all' | 'listing' | 'promotion';
const KIND_FILTER_OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all',       label: 'All' },
  { value: 'promotion', label: 'Promotions' },
  { value: 'listing',   label: 'Listings' },
];

const SORT_OPTIONS: Array<{ key: SortKey; dir: SortDir; label: string }> = [
  { key: 'createdAt',    dir: 'desc', label: 'Newest first' },
  { key: 'createdAt',    dir: 'asc',  label: 'Oldest first' },
  { key: 'builderName',  dir: 'asc',  label: 'Builder A \u2192 Z' },
  { key: 'builderName',  dir: 'desc', label: 'Builder Z \u2192 A' },
  { key: 'title',        dir: 'asc',  label: 'Title A \u2192 Z' },
  { key: 'title',        dir: 'desc', label: 'Title Z \u2192 A' },
  { key: 'city',         dir: 'asc',  label: 'City A \u2192 Z' },
  { key: 'city',         dir: 'desc', label: 'City Z \u2192 A' },
  { key: 'publication',  dir: 'asc',  label: 'Publication A \u2192 Z' },
  { key: 'kind',         dir: 'asc',  label: 'Kind (Listing first)' },
  { key: 'kind',         dir: 'desc', label: 'Kind (Promotion first)' },
];

function sortRows(rows: BuilderInventoryRow[], key: SortKey, dir: SortDir): BuilderInventoryRow[] {
  const mult = dir === 'asc' ? 1 : -1;
  const copy = rows.slice();
  copy.sort((a, b) => {
    let av: string | number = '';
    let bv: string | number = '';
    if (key === 'createdAt') {
      av = new Date(a.createdAt).getTime();
      bv = new Date(b.createdAt).getTime();
    } else {
      av = (a[key] ?? '').toString().toLowerCase();
      bv = (b[key] ?? '').toString().toLowerCase();
    }
    if (av < bv) return -1 * mult;
    if (av > bv) return  1 * mult;
    // Stable tiebreak by id so equal keys don't shuffle on re-sort.
    return (a.id - b.id) * mult;
  });
  return copy;
}

export default function AdminInventoryPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [rows, setRows] = useState<BuilderInventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<Status, number> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Default to 'promotion' so newly-created promos are visible immediately
  // after admin creates them (the most common reason to land on this page).
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/inventory?status=${tab}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        const body = (await res.json()) as {
          rows: BuilderInventoryRow[];
          counts: Record<Status, number>;
        };
        if (cancelled) return;
        setRows(body.rows);
        setCounts(body.counts);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setRows([]);
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  const handleEditClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: number) => {
      // Allow cmd/ctrl/middle-click to open the dedicated page in a new tab.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      setEditingId(id);
    },
    [],
  );

  const handleChanged = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  // Toggle sort direction when clicking the same column header; otherwise
  // switch to the new column with a sensible default direction (desc for
  // dates, asc for text fields).
  const setSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir(key === 'createdAt' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  // Apply kind filter before sorting so the count + sort reflect the filter.
  const filteredRows = useMemo(() => {
    if (!rows) return null;
    if (kindFilter === 'all') return rows;
    return rows.filter((r) => r.kind === kindFilter);
  }, [rows, kindFilter]);

  const sortedRows = useMemo(
    () => (filteredRows ? sortRows(filteredRows, sortKey, sortDir) : null),
    [filteredRows, sortKey, sortDir],
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
              Admin
            </p>
            <PageTitle size="md">
              Builder Inventory &amp; Promotions
            </PageTitle>
            <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
              Submissions from builder and developer clients. Approve, reject, or
              feature each entry. Approved items appear on the public /inventory
              page in the publication they were tagged for.
            </p>
          </div>
          <Link
            href="/admin/inventory/new"
            className="shrink-0 bg-[#301D5D] text-white px-4 py-2 text-sm font-medium hover:bg-[#493676] rounded-md transition-colors whitespace-nowrap"
          >
            + Create Promotion
          </Link>
        </div>

        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
            const active = t === tab;
            const count = counts?.[t];
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ' +
                  (active
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700')
                }
              >
                {TAB_LABELS[t]}
                {count != null && (
                  <span className="ml-2 text-xs text-gray-400">{count}</span>
                )}
                {t === 'pending' && !active && count != null && count > 0 && (
                  <span
                    aria-label={`${count} pending review`}
                    className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-600 align-middle"
                  />
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div
            role="alert"
            className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900 mb-6"
          >
            {error}
          </div>
        )}

        {rows == null && !error && (
          <p className="text-sm text-gray-500 font-light">Loading…</p>
        )}

        {rows != null && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">
                Showing {sortedRows?.length ?? 0}
                {(sortedRows?.length ?? 0) !== rows.length
                  ? ` of ${rows.length}`
                  : ''}{' '}
                {(sortedRows?.length ?? 0) === 1 ? 'item' : 'items'}
              </p>
              <div className="flex items-center gap-1" role="tablist" aria-label="Filter by kind">
                {KIND_FILTER_OPTIONS.map((opt) => {
                  const active = kindFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setKindFilter(opt.value)}
                      className={
                        'text-xs px-2.5 py-1 rounded-md border transition-colors ' +
                        (active
                          ? 'border-[#301D5D] bg-[#301D5D] text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500')
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Sort by</span>
              <select
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
                  setSortKey(k);
                  setSortDir(d);
                }}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#301D5D]/30"
                aria-label="Sort builder inventory"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={`${opt.key}:${opt.dir}`} value={`${opt.key}:${opt.dir}`}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {rows != null && rows.length === 0 && !error && (
          <EmptyState tab={tab} onSwitchTab={setTab} />
        )}

        <EditInventoryModal
          id={editingId}
          onClose={() => setEditingId(null)}
          onChanged={handleChanged}
        />

        {sortedRows != null && sortedRows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-medium w-20" />
                  <SortableHeader label="Submitted" k="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  <SortableHeader label="Builder / Title" k="builderName" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  <SortableHeader label="Kind" k="kind" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  <SortableHeader label="Publication" k="publication" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  <th className="px-4 py-3 font-medium">Submitter</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-200 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="w-16 h-16 bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center rounded-md">
                        {r.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-gray-300 text-2xl" aria-hidden="true">
                            &#x1F3E0;
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(r.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.builderName}</p>
                      <p className="text-gray-600">{r.title}</p>
                      <p className="text-xs text-gray-500">{r.city}, {r.state}</p>
                    </td>
                    <td className="px-4 py-3">
                      <KindBadge kind={r.kind} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.publication}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{r.submittedByName}</p>
                      <p className="text-xs text-gray-500">{r.submittedByEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/inventory/${r.id}`}
                        onClick={(e) => handleEditClick(e, r.id)}
                        className="text-sm font-medium text-gray-900 hover:underline"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab, onSwitchTab }: { tab: Tab; onSwitchTab: (t: Tab) => void }) {
  const messages: Record<Tab, string> = {
    pending: 'No submissions waiting for review.',
    active: 'No active submissions yet.',
    rejected: 'No rejected submissions.',
  };
  const cta: Partial<Record<Tab, { label: string; target: Tab }>> = {
    pending: { label: 'View active submissions →', target: 'active' },
    rejected: { label: 'View active submissions →', target: 'active' },
  };
  const action = cta[tab];
  return (
    <div className="bg-white border border-gray-200 rounded-md p-12 text-center">
      <p className="text-gray-500 font-light mb-4">{messages[tab]}</p>
      {action && (
        <button
          type="button"
          onClick={() => onSwitchTab(action.target)}
          className="text-sm font-medium text-[#301D5D] underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: 'listing' | 'promotion' }) {
  const styles =
    kind === 'listing'
      ? 'bg-green-50 text-green-900 rounded-md'
      : 'bg-amber-50 text-amber-900 rounded-md';
  return (
    <span
      className={
        'inline-block text-xs font-medium px-2 py-0.5 rounded-md ' + styles
      }
    >
      {kind === 'listing' ? 'Listing' : 'Promotion'}
    </span>
  );
}

function SortableHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '';
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={
          'inline-flex items-center gap-1 uppercase tracking-wider ' +
          (active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700')
        }
        aria-label={'Sort by ' + label}
      >
        <span>{label}</span>
        {arrow ? <span className="text-[10px]">{arrow}</span> : null}
      </button>
    </th>
  );
}
