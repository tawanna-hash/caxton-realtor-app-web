'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  BuilderInventoryRow,
  Status,
} from '@/lib/builder-inventory';
import EditInventoryModal from '@/components/inventory/EditInventoryModal';

import PageTitle from '@/components/ui/PageTitle';

type Kind = 'listing' | 'promotion';
type Tab = 'pending' | 'active' | 'rejected' | 'expired';

const TAB_LABELS: Record<Tab, string> = {
  pending: 'Pending review',
  active: 'Active',
  rejected: 'Rejected',
  expired: 'Expired',
};

// Sort-key identifies which row field to sort by; direction picks asc/desc.
// Defaults to newest-first (createdAt desc), matching prior behavior before
// the sort UI landed.
type SortKey =
  | 'createdAt'
  | 'builderName'
  | 'title'
  | 'city'
  | 'publication';
type SortDir = 'asc' | 'desc';

// Client-side pagination — the table loads every row for the active tab +
// kind (so sort still operates over the full set), then slices a page of
// PAGE_SIZE rows for display.
const PAGE_SIZE = 25;

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

const COPY: Record<Kind, {
  title: string;
  blurb: string;
  createLabel: string;
  emptyWord: string;
}> = {
  listing: {
    title: 'Builder Inventory',
    blurb:
      'Move-in ready homes, communities, and listings from builder and developer clients. Approve, reject, or feature each entry. Approved items appear on the public /inventory page in the publication they were tagged for.',
    createLabel: '+ Create Listing',
    emptyWord: 'listings',
  },
  promotion: {
    title: 'Builder Promotions',
    blurb:
      'Rate buydowns, incentives, and special offers from builder and developer clients. Approve, reject, or feature each entry. Approved items appear on the public /inventory page in the publication they were tagged for.',
    createLabel: '+ Create Promotion',
    emptyWord: 'promotions',
  },
};

function isStatus(v: string | null): v is Tab {
  return v === 'pending' || v === 'active' || v === 'rejected' || v === 'expired';
}

export default function AdminInventoryList({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  // Read the initial tab from ?status= so deep links (e.g. the "go to active
  // list" redirect after creating a row) land on the right tab. Defaults to
  // 'active' — the most common landing state.
  const [tab, setTab] = useState<Tab>('active');
  const [rows, setRows] = useState<BuilderInventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<Status, number> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [bulkApproving, setBulkApproving] = useState(false);

  // Sync the tab from the ?status= query param on mount + whenever the URL
  // changes (e.g. navigating between tabs via the browser). Client-only —
  // window isn't available during SSR, so guard with a check.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL param read on mount
    if (isStatus(s) && s !== tab) setTab(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/inventory?status=${tab}&kind=${kind}`, {
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
  }, [tab, kind, reloadKey]);

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

  // Bulk-approve every pending submission (status -> active) so all
  // builder/developer content goes live at once.
  const handleBulkApprove = useCallback(async () => {
    if (!window.confirm(
      'Approve all pending submissions? They will appear on the public /inventory immediately.',
    )) return;
    setBulkApproving(true);
    try {
      const res = await fetch('/api/admin/inventory/bulk-approve', {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; activated?: number; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk approve failed');
    } finally {
      setBulkApproving(false);
    }
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
    setPage(1);
  }, []);

  // Page resets live in the interactive handlers (not an effect) so the
  // react-hooks/set-state-in-effect rule stays happy.
  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setPage(1);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('status', t);
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  const sortedRows = useMemo(
    () => (rows ? sortRows(rows, sortKey, sortDir) : null),
    [rows, sortKey, sortDir],
  );

  const totalPages = sortedRows
    ? Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
    : 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedRows = useMemo<BuilderInventoryRow[]>(() => {
    if (!sortedRows) return [];
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, safePage]);

  const otherKind: Kind = kind === 'listing' ? 'promotion' : 'listing';
  const otherHref = otherKind === 'promotion' ? '/admin/inventory/promotions' : '/admin/inventory';
  const otherLabel = otherKind === 'promotion' ? 'Promotions' : 'Inventory';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
              Admin
            </p>
            <PageTitle size="md">
              {copy.title}
            </PageTitle>
            <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
              {copy.blurb}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {tab === 'pending' && (counts?.pending ?? 0) > 0 && (
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkApproving}
                className="shrink-0 bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700 rounded-md transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {bulkApproving
                  ? 'Approving…'
                  : `Approve all pending (${counts?.pending})`}
              </button>
            )}
            <Link
              href="/admin/content/scrapers"
              className="shrink-0 border border-brand-700 text-brand-700 px-4 py-2 text-sm font-medium hover:bg-brand-50 rounded-md transition-colors whitespace-nowrap"
            >
              Scraper Hub
            </Link>
            <Link
              href={`/admin/inventory/new?kind=${kind}`}
              className="shrink-0 bg-brand-700 text-white px-4 py-2 text-sm font-medium hover:bg-brand-800 rounded-md transition-colors whitespace-nowrap"
            >
              {copy.createLabel}
            </Link>
          </div>
        </div>

        {/* Cross-nav between the two split pages */}
        <div className="flex gap-1 mb-6">
          {([
            { k: 'listing' as Kind, href: '/admin/inventory', label: 'Inventory' },
            { k: 'promotion' as Kind, href: '/admin/inventory/promotions', label: 'Promotions' },
          ]).map((opt) => {
            const active = opt.k === kind;
            return (
              <Link
                key={opt.k}
                href={opt.href}
                className={
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors ' +
                  (active
                    ? 'bg-brand-700 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                }
              >
                {opt.label}
              </Link>
            );
          })}
          <Link
            href={otherHref}
            className="sr-only"
            aria-label={`View ${otherLabel}`}
          >
            {otherLabel}
          </Link>
        </div>

        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
            const active = t === tab;
            const count = counts?.[t];
            return (
              <button
                key={t}
                onClick={() => switchTab(t)}
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
            <p className="text-xs text-gray-500">
              Showing {sortedRows?.length ?? 0}{' '}
              {sortedRows?.length === 1 ? 'item' : 'items'}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Sort by</span>
              <select
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
                  setSortKey(k);
                  setSortDir(d);
                  setPage(1);
                }}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30"
                aria-label={`Sort ${copy.title}`}
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
          <EmptyState tab={tab} word={copy.emptyWord} onSwitchTab={switchTab} />
        )}

        <EditInventoryModal
          id={editingId}
          onClose={() => setEditingId(null)}
          onChanged={handleChanged}
        />

        {sortedRows != null && sortedRows.length > 0 && (
          <>
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-medium w-20" />
                  <SortableHeader label="Submitted" k="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  <SortableHeader label="Builder / Title" k="builderName" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  <SortableHeader label="Publication" k="publication" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                  <th className="px-4 py-3 font-medium">Submitter</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
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
          <Pager
            page={safePage}
            totalPages={totalPages}
            total={sortedRows.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab, word, onSwitchTab }: { tab: Tab; word: string; onSwitchTab: (t: Tab) => void }) {
  const messages: Record<Tab, string> = {
    pending: `No ${word} waiting for review.`,
    active: `No active ${word} yet.`,
    rejected: `No rejected ${word}.`,
    expired: `No ${word} have auto-expired yet.`,
  };
  const cta: Partial<Record<Tab, { label: string; target: Tab }>> = {
    pending: { label: 'View active →', target: 'active' },
    rejected: { label: 'View active →', target: 'active' },
    expired: { label: 'View active →', target: 'active' },
  };
  const action = cta[tab];
  return (
    <div className="bg-white border border-gray-200 rounded-md p-12 text-center">
      <p className="text-gray-500 font-light mb-4">{messages[tab]}</p>
      {action && (
        <button
          type="button"
          onClick={() => onSwitchTab(action.target)}
          className="text-sm font-medium text-brand-700 underline"
        >
          {action.label}
        </button>
      )}
    </div>
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

function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  // Windowed page list: first, last, and a couple of pages around the
  // current one, with ellipses where there are gaps.
  const pages: Array<number | 'ellipsis'> = [];
  const adj = 1;
  pages.push(1);
  const lo = Math.max(2, page - adj);
  const hi = Math.min(totalPages - 1, page + adj);
  if (lo > 2) pages.push('ellipsis');
  for (let pn = lo; pn <= hi; pn++) pages.push(pn);
  if (hi < totalPages - 1) pages.push('ellipsis');
  if (totalPages > 1) pages.push(totalPages);
  const btnBase =
    'min-w-[32px] px-2 py-1.5 text-sm rounded-md border transition-colors ';
  const navBtn =
    'px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-700 ' +
    'hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
      <p className="text-xs text-gray-500">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className={navBtn}
        >
          Prev
        </button>
        {pages.map((pn, i) =>
          pn === 'ellipsis' ? (
            <span key={`e${i}`} className="px-2 text-gray-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={pn}
              type="button"
              onClick={() => onChange(pn)}
              disabled={pn === page}
              className={
                btnBase +
                (pn === page
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500')
              }
            >
              {pn}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className={navBtn}
        >
          Next
        </button>
      </div>
    </div>
  );
}
