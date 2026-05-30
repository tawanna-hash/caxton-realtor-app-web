'use client';

// app/admin/mailing/holding/HoldingClient.tsx
//
// Client UI for the holding-contacts staging area.
//   - Search box, filter chips (all / verified / pending)
//   - Sortable columns (first/last/email/company/city/state/added)
//   - Per-row verify buttons (addr / email)
//   - Bulk select → Promote / Reject
//   - "Sync from UnlockMLS" button (calls /api/admin/mailing/sync-realtors)

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MailingColumnId,
  MailingContactRow,
  VerifyStatus,
} from '@/lib/mailing';

type Counts = { total: number; verified: number; pending: number };
type FilterKey = 'all' | 'verified' | 'pending';

const PAGE_SIZE = 100;
const SORTABLE: MailingColumnId[] = [
  'first_name', 'last_name', 'email', 'company', 'city', 'state', 'created_at',
];

export default function HoldingClient() {
  const [rows, setRows] = useState<MailingContactRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<MailingColumnId>('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState<number>(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filter,
        sort,
        dir,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/mailing/holding?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as { rows: MailingContactRow[]; total: number; counts: Counts };
      setRows(data.rows);
      setTotal(data.total);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter, sort, dir, offset, search]);

  // Initial + reactive reload
  useEffect(() => {
    queueMicrotask(() => { void reload(); });
  }, [reload]);

  // Debounce search → reset offset
  useEffect(() => {
    const t = setTimeout(() => {
      queueMicrotask(() => { setOffset(0); });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset offset when filter changes
  useEffect(() => {
    queueMicrotask(() => { setOffset(0); });
  }, [filter]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleSort = (col: MailingColumnId) => {
    if (!SORTABLE.includes(col)) return;
    if (sort === col) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col);
      setDir('asc');
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    setSelectedIds(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(rows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const verify = async (id: string, field: 'addr' | 'email', status: VerifyStatus) => {
    setBusy(`verify-${id}-${field}`);
    try {
      const res = await fetch('/api/admin/mailing/holding/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      await reload();
    } catch (err) {
      showToast(`Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const promote = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Promote ${ids.length} verified contact${ids.length === 1 ? '' : 's'} to the active mailing list?`)) return;
    setBusy('promote');
    try {
      const res = await fetch('/api/admin/mailing/holding/promote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      const promoted = j.promoted ?? 0;
      const unverified = j.rejected_unverified ?? 0;
      const dup = j.rejected_duplicate ?? 0;
      showToast(
        `Promoted ${promoted}` +
        (unverified ? ` · ${unverified} skipped (unverified)` : '') +
        (dup ? ` · ${dup} skipped (duplicate email)` : ''),
      );
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} holding contact${ids.length === 1 ? '' : 's'}?`)) return;
    setBusy('reject');
    try {
      const res = await fetch('/api/admin/mailing/holding/reject', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      showToast(`Rejected ${j.removed ?? 0} contact${(j.removed ?? 0) === 1 ? '' : 's'}`);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(`Reject failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const syncFromUnlockMLS = async () => {
    if (!confirm('Run the UnlockMLS realtor scraper now? This may take several minutes.')) return;
    setBusy('sync');
    try {
      const res = await fetch('/api/admin/mailing/sync-realtors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxRecords: 2000 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      showToast(
        `Sync complete: ${j.scraped ?? 0} scraped · ` +
        `${j.inserted ?? 0} new · ${j.updated ?? 0} updated · ${j.unchanged ?? 0} unchanged`,
      );
      await reload();
    } catch (err) {
      showToast(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Audience
          </p>
          <h1 className="font-serif text-3xl text-gray-900">Holding Contacts</h1>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Scraped or imported contacts staged for verification. Mark address
            or email as verified to enable promotion to the active mailing list.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            <Link href="/admin/mailing" className="underline hover:text-gray-700">
              ← Back to Mailing List
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={syncFromUnlockMLS}
            className="px-4 py-2 rounded-md bg-[#3D0740] text-white text-sm font-medium hover:bg-[#5A0E5F] disabled:opacity-50"
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync from UnlockMLS'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total in holding" value={counts?.total ?? 0} sub="awaiting review" />
        <KpiCard label="Verified" value={counts?.verified ?? 0} sub="ready to promote" accent="#10B981" />
        <KpiCard label="Pending" value={counts?.pending ?? 0} sub="needs verification" accent="#F59E0B" />
      </div>

      {/* Filter chips + search + bulk actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === 'all'}      onClick={() => setFilter('all')}      label="All" count={counts?.total ?? 0} />
        <FilterChip active={filter === 'verified'} onClick={() => setFilter('verified')} label="Verified" count={counts?.verified ?? 0} accent="#10B981" />
        <FilterChip active={filter === 'pending'}  onClick={() => setFilter('pending')}  label="Pending" count={counts?.pending ?? 0} accent="#F59E0B" />

        <div className="flex-1" />

        <input
          type="search"
          placeholder="Search name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-300 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#3D0740]"
        />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-gray-50 border border-gray-200">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={promote}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {busy === 'promote' ? 'Promoting…' : 'Promote to Mailing'}
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded-md text-gray-600 text-xs hover:text-gray-900"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="px-4 py-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-900">
          {toast}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              <SortHeader col="first_name" label="First"     sort={sort} dir={dir} onSort={handleSort} />
              <SortHeader col="last_name"  label="Last"      sort={sort} dir={dir} onSort={handleSort} />
              <SortHeader col="email"      label="Email"     sort={sort} dir={dir} onSort={handleSort} />
              <th className="px-3 py-3 text-left font-semibold">Phone</th>
              <SortHeader col="company"    label="Company"   sort={sort} dir={dir} onSort={handleSort} />
              <SortHeader col="city"       label="City"      sort={sort} dir={dir} onSort={handleSort} />
              <SortHeader col="state"      label="St"        sort={sort} dir={dir} onSort={handleSort} />
              <th className="px-3 py-3 text-left font-semibold">Address?</th>
              <th className="px-3 py-3 text-left font-semibold">Email?</th>
              <SortHeader col="created_at" label="Added"     sort={sort} dir={dir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                No holding contacts. Try “Sync from UnlockMLS” above.
              </td></tr>
            )}
            {!loading && rows.map((r) => {
              const hasAddr = !!(r.address || r.city || r.state || r.zip);
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => handleSelect(r.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-900">{r.first_name}</td>
                  <td className="px-3 py-2 text-gray-900">{r.last_name ?? ''}</td>
                  <td className="px-3 py-2 text-gray-700">{r.email ?? ''}</td>
                  <td className="px-3 py-2 text-gray-700">{r.phone ?? ''}</td>
                  <td className="px-3 py-2 text-gray-700">{r.company ?? ''}</td>
                  <td className="px-3 py-2 text-gray-700">{r.city ?? ''}</td>
                  <td className="px-3 py-2 text-gray-700">{r.state ?? ''}</td>
                  <td className="px-3 py-2">
                    <VerifyCell
                      status={r.addr_status}
                      hasData={hasAddr}
                      busy={busy === `verify-${r.id}-addr`}
                      onMark={(s) => verify(r.id, 'addr', s)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <VerifyCell
                      status={r.email_status}
                      hasData={!!r.email}
                      busy={busy === `verify-${r.id}-email`}
                      onMark={(s) => verify(r.id, 'email', s)}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          {total > 0
            ? `Showing ${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`
            : ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, accent,
}: { label: string; value: number; sub: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div
        className="h-7 w-7 rounded-md mb-3"
        style={{ backgroundColor: accent ? `${accent}15` : '#F3F4F6' }}
      />
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="mt-1">
        <div className="text-xs font-semibold text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
    </div>
  );
}

function FilterChip({
  active, onClick, label, count, accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: string;
}) {
  const bg = active ? (accent ?? '#3D0740') : '#F3F4F6';
  const fg = active ? 'white' : '#374151';
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span>{label}</span>
      <span
        className="px-1.5 rounded-full text-[10px]"
        style={{
          backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'white',
          color: active ? 'white' : '#6B7280',
        }}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function SortHeader({
  col, label, sort, dir, onSort,
}: {
  col: MailingColumnId;
  label: string;
  sort: MailingColumnId;
  dir: 'asc' | 'desc';
  onSort: (col: MailingColumnId) => void;
}) {
  const active = sort === col;
  return (
    <th
      className="px-3 py-3 text-left font-semibold cursor-pointer select-none hover:text-gray-900"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span>{dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function VerifyCell({
  status, hasData, busy, onMark,
}: {
  status: VerifyStatus | null;
  hasData: boolean;
  busy: boolean;
  onMark: (status: VerifyStatus) => void;
}) {
  if (!hasData) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  if (status === 'Valid') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onMark('Pending')}
        className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
        title="Click to reset to pending"
      >
        ✓ Valid
      </button>
    );
  }
  if (status === 'Invalid') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onMark('Pending')}
        className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50"
        title="Click to reset to pending"
      >
        ✗ Invalid
      </button>
    );
  }
  // Pending / null
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => onMark('Valid')}
        className="text-xs px-2 py-0.5 rounded-md border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
      >
        Valid
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onMark('Invalid')}
        className="text-xs px-2 py-0.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        ✗
      </button>
    </div>
  );
}
