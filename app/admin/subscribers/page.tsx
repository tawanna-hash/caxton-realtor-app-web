'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';
import { PUBLICATIONS, PUBLICATION_LABELS } from '@/lib/publications';
import { formatPhone } from '@/lib/format-phone';

import PageTitle from '@/components/ui/PageTitle';
import { Pager } from '@/app/admin/_components/Pager';
import EmailBadge, { type EmailBadgeStatus } from '@/app/admin/_components/EmailBadge';

type Subscriber = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  market: 'austin' | 'san_antonio';
  license_type: string | null;
  trec_license_number: string | null;
  nmls_license_number: string | null;
  title: string | null;
  mobile: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  fb_handle: string | null;
  ig_handle: string | null;
  li_handle: string | null;
  subscriptions: string[];
  status: string;
  created_at: string;
  last_login_at: string | null;
  last_app_open_at: string | null;
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

// useSearchParams() requires a Suspense boundary in the app router.
// Wrap the inner component so the boundary stays tight.
export default function SubscribersPage() {
  return (
    <Suspense fallback={null}>
      <SubscribersInner />
    </Suspense>
  );
}

function SubscribersInner() {
  const { admin, loading: authLoading } = useAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Initial market filter can be deep-linked via ?market=austin|san_antonio
  // (used by the Mailing Hub publication-split tiles).
  const initialMarket: '' | 'austin' | 'san_antonio' = (() => {
    const m = searchParams?.get('market');
    return m === 'austin' || m === 'san_antonio' ? m : '';
  })();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [market, setMarket] = useState<'' | 'austin' | 'san_antonio'>(initialMarket);
  const [verified, setVerified] = useState<'' | 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified'>('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<'created_at' | 'last_app_open_at' | 'email' | 'first_name' | 'last_name' | 'market' | 'city'>('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (!admin) return;
    queueMicrotask(() => setLoading(true));
    adminApi.listSubscribers({ page, pageSize, market: market || undefined, q: q || undefined, sort, dir, verified: verified || undefined })
      .then((res: ListResponse) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [admin, page, pageSize, market, q, sort, dir, verified]);

  // Reset selection on any filter/page change to avoid cross-context deletes
  // (defence-in-depth — selection is only used by Export selected below).
  useEffect(() => { queueMicrotask(() => setSelectedIds(new Set())); }, [page, market, q, sort, dir, verified]);

  function toggleSort(col: typeof sort) {
    if (sort === col) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(col); setDir('desc'); }
  }
  function toggleRow(id: string, checked: boolean) {
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
  async function exportSelected() {
    if (selectedIds.size === 0) return;
    // Fallback: full CSV export for now (selected-id-scoped export will be
    // added when the export route accepts an ids filter).
    setExporting(true);
    try { await adminApi.exportSubscribersCsv(); }
    catch (err) { alert('Export failed: ' + (err instanceof Error ? err.message : String(err))); }
    finally { setExporting(false); }
  }

  // Debounce: live-update committed query 300ms after user stops typing.
  useEffect(() => {
    const trimmed = qInput.trim();
    if (trimmed === q) return;
    const handle = setTimeout(() => {
      setPage(1);
      setQ(trimmed);
    }, 300);
    return () => clearTimeout(handle);
  }, [qInput, q]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminApi.exportSubscribersCsv();
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || !admin) {
    return <div className="max-w-7xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <PageTitle size="md">Subscribers</PageTitle>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.total.toLocaleString()} total` : 'Loading...'}
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

      <div className="bg-white border border-gray-200 rounded-md p-4 mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <input
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search email or name..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-700"
          />
          {q && (
            <button
              type="button"
              onClick={() => { setQInput(''); setQ(''); setPage(1); }}
              className="text-xs text-gray-500 underline"
            >
              Clear
            </button>
          )}
        </div>
        <select
          value={market}
          onChange={(e) => { setMarket(e.target.value as '' | 'austin' | 'san_antonio'); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900"
        >
          <option value="">All markets</option>
          {PUBLICATIONS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select
          value={verified}
          onChange={(e) => { setVerified(e.target.value as '' | 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified'); setPage(1); }}
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
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-4">Error: {error}</div>}

      {!loading && !error && data && (
        <>
          {mounted && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 mb-3 rounded-md bg-indigo-50 border border-indigo-200">
              <span className="text-sm text-indigo-900 font-medium">{selectedIds.size} selected on this page</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={exportSelected}
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

          <div className="bg-white border border-gray-200 rounded-md hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={mounted && data.subscribers.length > 0 && data.subscribers.every((s) => selectedIds.has(s.id))}
                      onChange={(e) => toggleAllOnPage(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <SortableTh label="Name"   col="first_name"      sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Email"  col="email"           sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Market" col="market"          sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="text-left px-4 py-3 font-medium text-gray-700">License</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Mobile</th>
                  <SortableTh label="City"   col="city"            sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Joined" col="created_at"      sort={sort} dir={dir} onSort={toggleSort} />
                  <SortableTh label="Last open" col="last_app_open_at" sort={sort} dir={dir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {data.subscribers.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No subscribers found.</td></tr>
                )}
                {data.subscribers.map((s) => (
                  <tr key={s.id} onClick={() => router.push(`/admin/subscribers/${s.id}`)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.email}`}
                        checked={mounted && selectedIds.has(s.id)}
                        onChange={(e) => toggleRow(s.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-900">{s.first_name} {s.last_name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="flex items-center gap-2">
                        <span>{s.email}</span>
                        <EmailBadge
                          status={s.email_verification_status ?? null}
                          title={s.email_verification_reason ?? undefined}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{PUBLICATION_LABELS[s.market as keyof typeof PUBLICATION_LABELS] || s.market}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.license_type === 'TREC' && s.trec_license_number ? `TREC ${s.trec_license_number}` :
                       s.license_type === 'NMLS' && s.nmls_license_number ? `NMLS ${s.nmls_license_number}` :
                       s.license_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatPhone(s.mobile) || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.city || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(s.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(s.last_app_open_at || s.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list. */}
          <ul className="sm:hidden bg-white border border-gray-200 rounded-md divide-y divide-gray-100">
            {data.subscribers.length === 0 && (
              <li className="px-4 py-8 text-center text-gray-400 text-sm">
                No subscribers found.
              </li>
            )}
            {data.subscribers.map((s) => (
              <li
                key={s.id}
                onClick={() => router.push(`/admin/subscribers/${s.id}`)}
                className="px-4 py-3 space-y-2 hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.email}`}
                    checked={mounted && selectedIds.has(s.id)}
                    onChange={(e) => toggleRow(s.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5">
                      <span className="truncate">{s.email}</span>
                      <EmailBadge
                        status={s.email_verification_status ?? null}
                        title={s.email_verification_reason ?? undefined}
                      />
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs pl-6">
                  <dt className="text-gray-500 uppercase tracking-wider">Market</dt>
                  <dd className="text-gray-800 text-right">
                    {PUBLICATION_LABELS[s.market as keyof typeof PUBLICATION_LABELS] || s.market}
                  </dd>
                  <dt className="text-gray-500 uppercase tracking-wider">License</dt>
                  <dd className="text-gray-800 text-right">
                    {s.license_type === 'TREC' && s.trec_license_number ? `TREC ${s.trec_license_number}` :
                     s.license_type === 'NMLS' && s.nmls_license_number ? `NMLS ${s.nmls_license_number}` :
                     s.license_type || '-'}
                  </dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Mobile</dt>
                  <dd className="text-gray-800 text-right">{formatPhone(s.mobile) || '-'}</dd>
                  <dt className="text-gray-500 uppercase tracking-wider">City</dt>
                  <dd className="text-gray-800 text-right">{s.city || '-'}</dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Joined</dt>
                  <dd className="text-gray-800 text-right">{formatDate(s.created_at)}</dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Last open</dt>
                  <dd className="text-gray-800 text-right">
                    {formatDate(s.last_app_open_at || s.last_login_at)}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>

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
