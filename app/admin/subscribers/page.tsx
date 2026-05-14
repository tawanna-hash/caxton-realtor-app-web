'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';

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
};

type ListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  subscribers: Subscriber[];
};

const MARKET_LABEL: Record<string, string> = {
  austin: 'RealtyLine (Austin)',
  san_antonio: 'Newsline (SA)',
};

function formatDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SubscribersPage() {
  const { admin, loading: authLoading } = useAdmin();
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [market, setMarket] = useState<'' | 'austin' | 'san_antonio'>('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!admin) return;
    setLoading(true);
    adminApi.listSubscribers({ page, pageSize, market: market || undefined, q: q || undefined })
      .then((res: ListResponse) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [admin, page, pageSize, market, q]);

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
    } catch (err: any) {
      alert('Export failed: ' + (err?.message || err));
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
          <h1 className="text-2xl font-semibold text-[#1a2a44] tracking-tight">Subscribers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.total.toLocaleString()} total` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-[#1a2a44] text-white px-4 py-2 text-sm font-medium hover:bg-[#243556] transition-colors disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV (all)'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded p-4 mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <input
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search email or name..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1a2a44]"
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
          onChange={(e) => { setMarket(e.target.value as any); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
        >
          <option value="">All markets</option>
          <option value="austin">RealtyLine (Austin)</option>
          <option value="san_antonio">Newsline (SA)</option>
        </select>
      </div>

      {loading && <div className="text-sm text-gray-500 py-8">Loading subscribers...</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4">Error: {error}</div>}

      {!loading && !error && data && (
        <>
          <div className="bg-white border border-gray-200 rounded overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Market</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">License</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Mobile</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">City</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Joined</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Last open</th>
                </tr>
              </thead>
              <tbody>
                {data.subscribers.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No subscribers found.</td></tr>
                )}
                {data.subscribers.map((s) => (
                  <tr key={s.id} onClick={() => router.push(`/admin/subscribers/${s.id}`)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 text-gray-900">{s.first_name} {s.last_name}</td>
                    <td className="px-4 py-3 text-gray-700">{s.email}</td>
                    <td className="px-4 py-3 text-gray-600">{MARKET_LABEL[s.market] || s.market}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.license_type === 'TREC' && s.trec_license_number ? `TREC ${s.trec_license_number}` :
                       s.license_type === 'NMLS' && s.nmls_license_number ? `NMLS ${s.nmls_license_number}` :
                       s.license_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.mobile || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.city || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(s.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(s.last_app_open_at || s.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-500">
                Page {data.page} of {data.totalPages} — showing {data.subscribers.length} of {data.total.toLocaleString()}
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
