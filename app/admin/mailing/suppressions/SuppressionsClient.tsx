// app/admin/mailing/suppressions/SuppressionsClient.tsx
//
// Browse + manage the email_suppressions tombstone list. Search by
// email, see why each entry was suppressed and when, and lift the
// suppression so the email can be re-added.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';
import { PAGE_SIZE_OPTIONS } from '@/app/admin/_components/Pager';

type Row = {
  email: string;
  reason: string;
  source_table: string | null;
  source_id: string | null;
  source_snapshot: Record<string, unknown> | null;
  suppressed_by: string | null;
  suppressed_at: string;
};

type ApiResponse = {
  rows: Row[];
  total: number;
  limit: number;
  offset: number;
  q: string;
};

const DEFAULT_PAGE_SIZE = 100;
const ACCENT = '#301D5D';

const REASON_LABEL: Record<string, string> = {
  admin_delete: 'Admin delete',
  admin_bulk_delete: 'Bulk delete',
  holding_reject: 'Holding rejected',
  manual: 'Manual',
};

const REASON_COLOR: Record<string, string> = {
  admin_delete: '#dc2626',
  admin_bulk_delete: '#b91c1c',
  holding_reject: '#d97706',
  manual: '#475569',
};

export default function SuppressionsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  // Debounce the search box so we don't spam the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Reset to page 1 whenever the search changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      if (debouncedQuery) params.set('q', debouncedQuery);
      const r = await fetch(`/api/admin/email-suppressions?${params.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as ApiResponse;
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const unsuppress = async (email: string) => {
    if (!confirm(`Lift suppression for ${email}? They will be re-importable from ABOR/SABOR sync and addable via admin.`)) {
      return;
    }
    setBusyEmail(email);
    try {
      const r = await fetch('/api/admin/email-suppressions', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      alert(`Failed to lift suppression: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyEmail(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const snapshotName = useCallback((snap: Record<string, unknown> | null): string => {
    if (!snap) return '';
    const first = typeof snap.first_name === 'string' ? snap.first_name : '';
    const last = typeof snap.last_name === 'string' ? snap.last_name : '';
    const combined = [first, last].filter(Boolean).join(' ').trim();
    return combined;
  }, []);

  const snapshotSegment = useCallback((snap: Record<string, unknown> | null): string => {
    if (!snap) return '';
    const seg = typeof snap.segment === 'string' ? snap.segment : '';
    const stage = typeof snap.stage === 'string' ? snap.stage : '';
    if (seg && stage) return `${seg} · ${stage}`;
    return seg || stage;
  }, []);

  const formatDate = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <MailingBreadcrumb
        trail={[
          { label: 'Mailing', href: '/admin/mailing' },
          { label: 'Suppressions' },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Permanent delete tombstones
          </p>
          <PageTitle size="md">Email suppressions</PageTitle>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Every email deleted from the Mailing Hub lands here so the
            ABOR/SABOR sync can never silently re-insert it. Lift a
            suppression to allow the email to flow back in on the next
            sync.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold" style={{ color: ACCENT }}>
            {total.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Total suppressed</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search by email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px] max-w-md text-sm px-3 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <span className="ml-auto text-xs text-gray-500">
          {loading ? 'Loading…' : `Page ${safePage} of ${pageCount}`}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load suppressions: {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left font-medium px-3 py-2">Email</th>
              <th className="text-left font-medium px-3 py-2">Name (at delete time)</th>
              <th className="text-left font-medium px-3 py-2">Source segment</th>
              <th className="text-left font-medium px-3 py-2">Reason</th>
              <th className="text-left font-medium px-3 py-2">Suppressed</th>
              <th className="text-left font-medium px-3 py-2">By</th>
              <th className="text-right font-medium px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  {debouncedQuery
                    ? `No suppressions match "${debouncedQuery}".`
                    : 'No suppressed emails yet. Deleting a Mailing Hub contact will tombstone them here.'}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => {
                const reasonLabel = REASON_LABEL[r.reason] ?? r.reason;
                const reasonColor = REASON_COLOR[r.reason] ?? '#475569';
                let when = '—';
                try {
                  when = formatDate.format(new Date(r.suppressed_at));
                } catch {
                  /* ignore */
                }
                return (
                  <tr key={r.email} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-[13px] text-gray-900 break-all">{r.email}</td>
                    <td className="px-3 py-2 text-gray-700">{snapshotName(r.source_snapshot) || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{snapshotSegment(r.source_snapshot) || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                        style={{ backgroundColor: reasonColor }}
                      >
                        {reasonLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{when}</td>
                    <td className="px-3 py-2 text-gray-600 text-[12px]">{r.suppressed_by || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => unsuppress(r.email)}
                        disabled={busyEmail === r.email}
                        className="inline-flex items-center px-2.5 py-1 rounded-md border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busyEmail === r.email ? 'Lifting…' : 'Unsuppress'}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600 flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            Showing{' '}
            <span className="font-semibold">
              {((safePage - 1) * pageSize + 1).toLocaleString()}–
              {Math.min(safePage * pageSize, total).toLocaleString()}
            </span>{' '}
            of <span className="font-semibold">{total.toLocaleString()}</span>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
              className="text-xs px-1.5 py-1 rounded border border-gray-300 bg-white"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2" style={{ visibility: pageCount > 1 ? 'visible' : 'hidden' }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1 rounded border border-gray-300 text-xs font-medium disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="text-xs">
              Page {safePage} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount}
              className="px-3 py-1 rounded border border-gray-300 text-xs font-medium disabled:opacity-50"
            >
              Next →
            </button>
        </div>
      </div>
    </div>
  );
}
