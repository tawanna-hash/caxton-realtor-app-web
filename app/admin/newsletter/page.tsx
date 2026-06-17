'use client';

import { useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';

type Subscriber = {
  id: number;
  email: string;
  publication: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
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
}) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  if (params.publication) qs.set('publication', params.publication);
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  return qs.toString();
}

export default function NewsletterSubscribersPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [publication, setPublication] = useState<'' | 'realtyline' | 'newsline'>('');
  const [status, setStatus] = useState<'' | 'active' | 'unsubscribed'>('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    const qs = buildQuery({ page, pageSize, publication, status, q });
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
  }, [admin, page, pageSize, publication, status, q]);

  // Debounce committed q 300ms after user stops typing.
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
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#021D40] tracking-tight">Newsletter</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.total.toLocaleString()} weekly-digest signups` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-[#021D40] text-white px-4 py-2 text-sm font-medium hover:bg-[#03285a] rounded-md transition-colors disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search email..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40]"
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
          className="px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
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
          className="px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
      </div>

      {loading && <div className="text-sm text-gray-500 py-8">Loading subscribers...</div>}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4">
          Error: {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="bg-white border border-gray-200 rounded overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Publication</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.subscribers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No newsletter subscribers found.
                    </td>
                  </tr>
                )}
                {data.subscribers.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{s.email}</td>
                    <td className="px-4 py-3 text-gray-600">{s.publication}</td>
                    <td className="px-4 py-3 text-gray-600">{s.source}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'inline-block px-2 py-0.5 text-xs rounded ' +
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

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-500">
                Page {data.page} of {data.totalPages} — showing {data.subscribers.length} of{' '}
                {data.total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
