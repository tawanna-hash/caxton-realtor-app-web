'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useUrlNumber, useUrlState, useUrlString } from '@/lib/use-url-state';

import PageTitle from '@/components/ui/PageTitle';
import { Pager } from '@/app/admin/_components/Pager';
import EmailBadge, { type EmailBadgeStatus } from '@/app/admin/_components/EmailBadge';

type Subscriber = {
  id: number;
  email: string;
  publication: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
  email_verification_status?: EmailBadgeStatus;
  email_verification_reason?: string | null;
  email_verified_at?: string | null;
};

type ListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  subscribers: Subscriber[];
};

function formatDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildQuery(params: {
  page: number;
  pageSize: number;
  publication: string;
  status: string;
  q: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  verified?: string;
}) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  if (params.publication) qs.set('publication', params.publication);
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  if (params.sort) qs.set('sort', params.sort);
  if (params.dir) qs.set('dir', params.dir);
  if (params.verified) qs.set('verified', params.verified);
  return qs.toString();
}

export default function NewsletterSubscribersPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pagination / filters / sort are URL-backed so refresh keeps the same view.
  const [page, setPage] = useUrlNumber('page', 1);
  const [pageSize] = useState(50);
  const [publication, setPublication] = useUrlString<'' | 'realtyline' | 'newsline'>('publication', '');
  const [status, setStatus] = useUrlString<'' | 'active' | 'unsubscribed'>('status', '');
  const [verified, setVerified] = useUrlString<'' | 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified'>('verified', '');
  const [q, setQ] = useUrlState<string>('q', '', {
    parse: (raw) => raw ?? '',
    stringify: (v) => (v ? v : null),
  });
  // Seed the debounced input from the URL-backed q so refresh keeps the
  // search field populated. useState lazy-init reads q at mount only.
  const [qInput, setQInput] = useState<string>(() => q);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useUrlString<'created_at' | 'email' | 'publication' | 'source' | 'status'>('sort', 'created_at');
  const [dir, setDir] = useUrlString<'asc' | 'desc'>('dir', 'desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    const qs = buildQuery({ page, pageSize, publication, status, q, sort, dir, verified });
    (async () => {
      try {
        const res = await fetch(`/api/admin/newsletter-subscribers?${qs}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
        }
        const json = (await res.json()) as ListResponse;
        if (cancelled) return;
        setData(json);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [admin, page, pageSize, publication, status, q, sort, dir, verified]);

  useEffect(() => { queueMicrotask(() => setSelectedIds(new Set())); }, [page, publication, status, q, sort, dir]);

  function toggleSort(col: typeof sort) {
    if (sort === col) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(col); setDir('desc'); }
  }
  function toggleRow(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function toggleAllOnPage(checked: boolean) {
    if (!data) return;
    if (checked) setSelectedIds(new Set(data.subscribers.map((s) => s.id)));
    else setSelectedIds(new Set());
  }
  function clearSelection() { setSelectedIds(new Set()); }

  // Debounce committed q 300ms after user stops typing.
  useEffect(() => {
    const trimmed = qInput.trim();
    if (trimmed === q) return;
    const handle = setTimeout(() => {
      setPage(1);
      setQ(trimmed);
    }, 300);
    return () => clearTimeout(handle);
    // setPage / setQ are stable useUrlState setters (useCallback under
    // the hood); eslint can't see through the custom hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput, q]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = buildQuery({ page: 1, pageSize, publication, status, q });
      const res = await fetch(`/api/admin/newsletter-subscribers/export.csv?${qs}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match
        ? match[1]
        : `newsletter_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Export failed: ' + msg);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || !admin) {
    return <div className="max-w-7xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <PageTitle size="md">Newsletter</PageTitle>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.total.toLocaleString()} weekly-digest signups` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-brand-700 text-white px-4 py-2 text-sm font-medium hover:bg-brand-800 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-md p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search email..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-700"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQInput('');
                setQ('');
                setPage(1);
              }}
              className="text-xs text-gray-500 underline"
            >
              Clear
            </button>
          )}
        </div>
        <select
          value={publication}
          onChange={(e) => {
            setPublication(e.target.value as '' | 'realtyline' | 'newsline');
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900"
        >
          <option value="">All publications</option>
          <option value="realtyline">RealtyLine</option>
          <option value="newsline">NewsLine</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | 'active' | 'unsubscribed');
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <select
          value={verified}
          onChange={(e) => {
            setVerified(e.target.value as '' | 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified');
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900"
          title="Filter by email verification status"
        >
          <option value="">All verification statuses</option>
          <option value="valid">Valid</option>
          <option value="invalid">Invalid</option>
          <option value="risky">Risky</option>
          <option value="unknown">Unknown</option>
          <option value="pending">Pending</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>

      {loading && <div className="text-sm text-gray-500 py-8">Loading subscribers...</div>}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-4">
          Error: {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {mounted && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 mb-3 rounded-md bg-indigo-50 border border-indigo-200">
              <span className="text-sm text-indigo-900 font-medium">{selectedIds.size} selected on this page</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="px-3 py-1.5 rounded-md border border-indigo-300 text-indigo-700 text-xs font-medium hover:bg-indigo-100 disabled:opacity-50"
              >
                {exporting ? 'Exporting…' : 'Export CSV (full)'}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="px-3 py-1.5 rounded-md text-indigo-700 text-xs hover:text-indigo-900"
              >
                Clear
              </button>
            </div>
          )}

          {/* mobile card list */}
          <ul className="sm:hidden divide-y divide-gray-100 rounded-md border border-gray-200 bg-white overflow-hidden">
            <li className="flex items-center gap-2 px-3 py-2 bg-gray-50">
              <input
                id="newsletter-select-all-mobile"
                type="checkbox"
                aria-label="Select all on this page"
                checked={mounted && data.subscribers.length > 0 && data.subscribers.every((s) => selectedIds.has(s.id))}
                onChange={(e) => toggleAllOnPage(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="newsletter-select-all-mobile" className="text-xs font-medium text-gray-700">Select all on this page</label>
            </li>
            {data.subscribers.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-gray-400">No newsletter subscribers found.</li>
            ) : (
              data.subscribers.map((s) => (
                <li key={`m-${s.id}`} className="p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${s.email}`}
                      checked={mounted && selectedIds.has(s.id)}
                      onChange={(e) => toggleRow(s.id, e.target.checked)}
                      className="h-4 w-4 mt-1 rounded border-gray-300"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-gray-900 truncate">{s.email}</span>
                          <EmailBadge
                            status={s.email_verification_status ?? null}
                            title={s.email_verification_reason ?? undefined}
                          />
                        </div>
                        <span
                          className={
                            'shrink-0 inline-block px-2 py-0.5 text-[10px] rounded-md ' +
                            (s.status === 'active'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200')
                          }
                        >
                          {s.status}
                        </span>
                      </div>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-gray-500">Publication</dt>
                        <dd className="text-gray-700">{s.publication}</dd>
                        <dt className="text-gray-500">Source</dt>
                        <dd className="text-gray-700">{s.source}</dd>
                        <dt className="text-gray-500">Joined</dt>
                        <dd className="text-gray-600">{formatDate(s.created_at)}</dd>
                      </dl>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="hidden sm:block bg-white border border-gray-200 rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={mounted && data.subscribers.length > 0 && data.subscribers.every((s) => selectedIds.has(s.id))}
                      onChange={(e) => toggleAllOnPage(e.target.checked)}
                    />
                  </th>
                  <SortableTh label="Email"       col="email"       sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Publication" col="publication" sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Source"      col="source"      sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Status"      col="status"      sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Joined"      col="created_at"  sort={sort} dir={dir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {data.subscribers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No newsletter subscribers found.
                    </td>
                  </tr>
                )}
                {data.subscribers.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.email}`}
                        checked={mounted && selectedIds.has(s.id)}
                        onChange={(e) => toggleRow(s.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{s.email}</span>
                        <EmailBadge
                          status={s.email_verification_status ?? null}
                          title={s.email_verification_reason ?? undefined}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.publication}</td>
                    <td className="px-4 py-3 text-gray-600">{s.source}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'inline-block px-2 py-0.5 text-xs rounded-md ' +
                          (s.status === 'active'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200')
                        }
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <Pager
              currentPage={data.page}
              totalItems={data.total}
              pageSize={data.pageSize}
              disabled={loading}
              onPageChange={(p) => setPage(p)}
              summary={`Page ${data.page} of ${data.totalPages} — showing ${data.subscribers.length} of ${data.total.toLocaleString()}`}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SortableTh<C extends string>({
  label, col, sort, dir, onSort,
}: {
  label: string;
  col: C;
  sort: string;
  dir: 'asc' | 'desc';
  onSort: (c: C) => void;
}) {
  const active = sort === col;
  return (
    <th className="text-left px-4 py-3 font-medium text-gray-700">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={'inline-flex items-center gap-1 hover:text-gray-900 ' + (active ? 'text-gray-900' : '')}
      >
        {label}
        <span className="text-xs text-gray-400">
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
