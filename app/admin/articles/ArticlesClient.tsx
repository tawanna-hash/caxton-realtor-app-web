'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { NewsArticle } from '@/lib/server/wp-news';

type Props = {
  initialArticles: NewsArticle[];
  initialErrors: string[];
};

type PubFilter = 'all' | 'austin' | 'san_antonio';

const PUB_LABEL: Record<NewsArticle['publication'], string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
};

const PUB_STYLES: Record<NewsArticle['publication'], string> = {
  austin: 'bg-[#021D40]/10 text-[#021D40] border-[#021D40]/20',
  san_antonio: 'bg-[#3D0740]/10 text-[#3D0740] border-[#3D0740]/20',
};

function formatDate(iso: string | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ArticlesClient({ initialArticles, initialErrors }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<PubFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialArticles.filter((a) => {
      if (filter !== 'all' && a.publication !== filter) return false;
      if (!q) return true;
      return (
        a.head.toLowerCase().includes(q) ||
        (a.author?.name || '').toLowerCase().includes(q) ||
        a.cat.toLowerCase().includes(q)
      );
    });
  }, [initialArticles, filter, search]);

  const counts = useMemo(() => {
    const c = { all: initialArticles.length, austin: 0, san_antonio: 0 };
    for (const a of initialArticles) c[a.publication] += 1;
    return c;
  }, [initialArticles]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/admin/articles/sync', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Sync failed (${res.status})`);
      }
      setSyncedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
      startTransition(() => router.refresh());
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const busy = syncing || pending;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Content</p>
          <h1 className="font-serif text-3xl text-gray-900">Articles</h1>
          <p className="text-sm text-gray-600 mt-1">
            All articles pulled from WordPress feeds. Cache refreshes every 30 minutes;
            use Sync now to refresh immediately.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-[#021D40] px-4 py-2 text-sm font-medium text-white hover:bg-[#021D40]/90 disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
          >
            {busy ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Syncing…
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                  <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                </svg>
                Sync now
              </>
            )}
          </button>
          {syncedAt && !syncError && (
            <span className="text-xs text-gray-500">Last sync: {syncedAt}</span>
          )}
          {syncError && (
            <span className="text-xs text-red-600">{syncError}</span>
          )}
        </div>
      </div>

      {/* Feed errors */}
      {initialErrors.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Some feeds failed to load:</p>
          <ul className="mt-1 list-disc list-inside">
            {initialErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'austin', 'san_antonio'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === key
                ? 'bg-[#021D40] text-white border-[#021D40]'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {key === 'all' ? 'All' : PUB_LABEL[key]}{' '}
            <span className={filter === key ? 'text-white/70' : 'text-gray-400'}>
              {counts[key]}
            </span>
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, author, or category…"
          className="ml-auto flex-1 sm:flex-none sm:w-80 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#021D40]/30 focus:border-[#021D40]"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            {initialArticles.length === 0
              ? 'No articles loaded. Try Sync now to fetch from WordPress.'
              : 'No articles match your filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Publication</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium text-right">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {a.imageThumb || a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.imageThumb || a.imageUrl || ''}
                            alt=""
                            className="w-12 h-12 object-cover rounded flex-shrink-0 bg-gray-100"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-gray-100 flex-shrink-0" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 line-clamp-2">{a.head}</p>
                          {a.sum && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{a.sum}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${PUB_STYLES[a.publication]}`}
                      >
                        {PUB_LABEL[a.publication]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{a.cat}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {a.author?.name || <span className="text-gray-400">Staff</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDate(a.dateIso || a.publishedAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <a
                        href={a.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#021D40] hover:underline text-xs font-medium"
                      >
                        View ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
            Showing {filtered.length} of {initialArticles.length} articles
          </div>
        </div>
      )}
    </div>
  );
}
