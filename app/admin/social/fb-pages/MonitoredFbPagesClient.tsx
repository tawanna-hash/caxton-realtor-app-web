// caxton-monitored-fb-pages-client-v1
// Admin curator for Pages-I-follow. Backed by monitored_fb_pages table.

'use client';

import { useCallback, useEffect, useState } from 'react';

type MonitoredPub = 'austin' | 'san_antonio';

interface MonitoredFbPage {
  id: number;
  slug: string;
  label: string;
  pub: MonitoredPub;
  is_active: boolean;
  last_scanned_at: string | null;
  last_post_count: number;
  last_detected: number;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

const PUB_LABEL: Record<MonitoredPub, string> = {
  austin: 'RealtyLine',
  san_antonio: 'Newsline',
};

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'never';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export default function MonitoredFbPagesClient() {
  const [pages, setPages] = useState<MonitoredFbPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [urlOrSlug, setUrlOrSlug] = useState('');
  const [label, setLabel] = useState('');
  const [pub, setPub] = useState<MonitoredPub>('austin');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/monitored-fb-pages', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { pages: MonitoredFbPage[] };
      setPages(data.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer to a microtask so setState isn't called synchronously inside
    // the effect body (lint rule react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!urlOrSlug.trim() || !label.trim()) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/monitored-fb-pages', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url_or_slug: urlOrSlug.trim(),
            label: label.trim(),
            pub,
          }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.error || `HTTP ${res.status}`);
        }
        setUrlOrSlug('');
        setLabel('');
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [urlOrSlug, label, pub, load]
  );

  const handleToggle = useCallback(
    async (id: number, nextActive: boolean) => {
      try {
        const res = await fetch(`/api/admin/monitored-fb-pages/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: nextActive }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [load]
  );

  const handleDelete = useCallback(
    async (id: number, label: string) => {
      if (!confirm(`Remove "${label}" from the monitored list?`)) return;
      try {
        const res = await fetch(`/api/admin/monitored-fb-pages/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [load]
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
        Content &middot; Facebook Events
      </p>
      <h1 className="font-serif text-3xl text-gray-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
        Facebook Events
      </h1>
      <p className="text-gray-600 mb-6 max-w-2xl">
        Pages on this list are scanned every few hours by a headless browser. Any
        recent post that looks like an event announcement is auto-detected and
        sent to the pending events queue.
      </p>

      <form
        onSubmit={handleAdd}
        className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
              Page URL or @handle
            </label>
            <input
              type="text"
              value={urlOrSlug}
              onChange={(e) => setUrlOrSlug(e.target.value)}
              placeholder="facebook.com/HomeBuildersAssociationGreaterAustin"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
              Display label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="HBA Greater Austin"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
              Publication
            </label>
            <select
              value={pub}
              onChange={(e) => setPub(e.target.value as MonitoredPub)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="austin">RealtyLine</option>
              <option value="san_antonio">Newsline</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gray-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:bg-gray-400"
            >
              {submitting ? 'Adding…' : 'Add Page'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Tip: paste the full Page URL, the @handle, or just the slug. The cron
          rotates through active Pages oldest-first.
        </p>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading&hellip;</div>
      ) : pages.length === 0 ? (
        <div className="text-gray-500 italic">
          No monitored pages yet. Add one above to start scanning.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Page</th>
                <th className="px-4 py-3 text-left">Pub</th>
                <th className="px-4 py-3 text-left">Last scan</th>
                <th className="px-4 py-3 text-left">Detected</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pages.map((p) => (
                <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.label}</div>
                    <a
                      href={`https://www.facebook.com/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      @{p.slug}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{PUB_LABEL[p.pub]}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatTimestamp(p.last_scanned_at)}
                    {p.last_post_count > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        ({p.last_post_count} posts)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.last_detected > 0 ? (
                      <span className="text-green-700 font-medium">
                        {p.last_detected}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.last_error ? (
                      <span
                        className="text-xs text-red-700"
                        title={p.last_error}
                      >
                        {p.consecutive_failures > 1
                          ? `${p.consecutive_failures}\u00d7 failed`
                          : 'failed'}
                      </span>
                    ) : p.is_active ? (
                      <span className="text-xs text-green-700">active</span>
                    ) : (
                      <span className="text-xs text-gray-500">paused</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleToggle(p.id, !p.is_active)}
                      className="text-xs px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      {p.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.label)}
                      className="text-xs px-3 py-1 border border-red-200 text-red-700 rounded-md hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
