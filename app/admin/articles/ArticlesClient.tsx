'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { useUrlState, useUrlString } from '@/lib/use-url-state';
import { useRouter } from 'next/navigation';
import type { NewsArticle } from '@/lib/server/wp-news';

import PageTitle from '@/components/ui/PageTitle';
export type AdminArticle = NewsArticle & {
  hidden: boolean;
  editedFields: string[];
};

type Props = {
  initialArticles: AdminArticle[];
  initialErrors: string[];
};

type PubFilter = 'all' | 'austin' | 'san_antonio';

const PUB_LABEL: Record<NewsArticle['publication'], string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
};

const PUB_STYLES: Record<NewsArticle['publication'], string> = {
  austin: 'bg-brand-700/10 text-brand-700 border-brand-700/20',
  san_antonio: 'bg-brand-700/10 text-brand-700 border-brand-700/20',
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
  // Filter and search live in the URL so refresh preserves them.
  const [filter, setFilter] = useUrlString<PubFilter>('filter', 'all');
  const [search, setSearch] = useUrlState<string>('q', '', {
    parse: (raw) => raw ?? '',
    stringify: (v) => (v ? v : null),
  });
  const [editing, setEditing] = useState<AdminArticle | null>(null);

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

  function handleSaved() {
    setEditing(null);
    startTransition(() => router.refresh());
  }

  const busy = syncing || pending;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Content</p>
          <PageTitle size="md">Articles</PageTitle>
          <p className="text-sm text-gray-600 mt-1">
            All articles pulled from WordPress feeds. Edits are saved locally and applied
            instantly to the public app — WordPress is untouched. Use Sync now to refresh
            the upstream feed.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700/90 disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px] whitespace-nowrap"
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
          {syncError && <span className="text-xs text-red-600">{syncError}</span>}
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
                ? 'bg-brand-700 text-white border-brand-700'
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
          className="ml-auto flex-1 sm:flex-none sm:w-80 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            {initialArticles.length === 0
              ? 'No articles loaded. Try Sync now to fetch from WordPress.'
              : 'No articles match your filters.'}
          </p>
        </div>
      ) : (
        <>
        {/* mobile card list */}
        <ul className="sm:hidden divide-y divide-gray-100 rounded-md border border-gray-200 bg-white overflow-hidden">
          {filtered.map((a) => (
            <li key={`m-${a.id}`} className={`p-3 ${a.hidden ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                {a.imageThumb || a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.imageThumb || a.imageUrl || ''}
                    alt=""
                    className="w-14 h-14 object-cover rounded-md flex-shrink-0 bg-gray-100"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-gray-100 flex-shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${PUB_STYLES[a.publication]}`}>
                      {PUB_LABEL[a.publication]}
                    </span>
                    {a.editedFields.length > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Edited</span>
                    )}
                    {a.hidden && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">Hidden</span>
                    )}
                  </div>
                  <p className="font-medium text-gray-900 mt-1 line-clamp-2">{a.head}</p>
                  {a.sum && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.sum}</p>}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-gray-500">Category</dt>
                <dd className="text-gray-700">{a.cat}</dd>
                <dt className="text-gray-500">Author</dt>
                <dd className="text-gray-700">{a.author?.name || 'Staff'}</dd>
                <dt className="text-gray-500">Published</dt>
                <dd className="text-gray-700">{formatDate(a.dateIso || a.publishedAt)}</dd>
              </dl>
              <div className="mt-2 flex items-center gap-3">
                <button type="button" onClick={() => setEditing(a)} className="text-brand-700 hover:underline text-xs font-medium">Edit</button>
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:underline text-xs">View ↗</a>
              </div>
            </li>
          ))}
          <li className="px-3 py-2 bg-gray-50 text-xs text-gray-500">
            Showing {filtered.length} of {initialArticles.length} articles
          </li>
        </ul>
        <div className="hidden sm:block overflow-hidden rounded-md border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Publication</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className={`hover:bg-gray-50 ${a.hidden ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {a.imageThumb || a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.imageThumb || a.imageUrl || ''}
                            alt=""
                            className="w-12 h-12 object-cover rounded-md flex-shrink-0 bg-gray-100"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-gray-100 flex-shrink-0" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900 line-clamp-2">{a.head}</p>
                            {a.editedFields.length > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                Edited
                              </span>
                            )}
                            {a.hidden && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                                Hidden
                              </span>
                            )}
                          </div>
                          {a.sum && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{a.sum}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${PUB_STYLES[a.publication]}`}
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
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          className="text-brand-700 hover:underline text-xs font-medium"
                        >
                          Edit
                        </button>
                        <a
                          href={a.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 hover:underline text-xs"
                        >
                          View ↗
                        </a>
                      </div>
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
        </>
      )}

      {editing && (
        <EditModal
          article={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// =============================================================================
// Edit modal
// =============================================================================

function EditModal({
  article,
  onClose,
  onSaved,
}: {
  article: AdminArticle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [head, setHead] = useState(article.head);
  const [excerpt, setExcerpt] = useState(article.sum || article.excerpt || '');
  const [contentHtml, setContentHtml] = useState(article.contentHtml || '');
  const [imageUrl, setImageUrl] = useState(article.imageUrl || '');
  const [authorName, setAuthorName] = useState(article.author?.name || '');
  const [authorAvatar, setAuthorAvatar] = useState(article.author?.avatar || '');
  const [cat, setCat] = useState(article.cat);
  const [tagsCsv, setTagsCsv] = useState((article.tags || []).join(', '));
  const [hidden, setHidden] = useState(article.hidden);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        head: head.trim() || null,
        excerpt: excerpt.trim() || null,
        contentHtml: contentHtml.trim() || null,
        imageUrl: imageUrl.trim() || null,
        authorName: authorName.trim() || null,
        authorAvatar: authorAvatar.trim() || null,
        cat: cat.trim() || null,
        tags: tagsCsv
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        hidden,
      };
      const res = await fetch(`/api/admin/articles/${encodeURIComponent(article.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || `Save failed (${res.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    if (!confirm('Revert all admin edits for this article? Upstream WordPress values will be restored.')) {
      return;
    }
    setReverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/articles/${encodeURIComponent(article.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || `Revert failed (${res.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setReverting(false);
    }
  }

  const busy = saving || reverting;
  const hasOverride = article.editedFields.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-md shadow-xl max-w-3xl w-full my-8">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
              Edit article · {PUB_LABEL[article.publication]}
            </p>
            <h2 className="font-serif text-xl text-gray-900 mt-1 line-clamp-1">{article.head}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none min-h-[44px] min-w-[44px]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Title">
            <input
              type="text"
              value={head}
              onChange={(e) => setHead(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
            />
          </Field>

          <Field label="Category">
            <input
              type="text"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Author name">
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
              />
            </Field>
            <Field label="Author photo" hint="Upload an image or paste a URL">
              <ImageUpload
                kind="author"
                value={authorAvatar}
                onChange={setAuthorAvatar}
                previewClassName="w-16 h-16 rounded-full"
              />
            </Field>
          </div>

          <Field label="Featured image" hint="Upload an image or paste a URL">
            <ImageUpload
              kind="featured"
              value={imageUrl}
              onChange={setImageUrl}
              previewClassName="w-32 h-20 rounded-md"
            />
          </Field>

          <Field label="Excerpt / summary">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700 resize-y"
            />
          </Field>

          <Field label="Body (HTML)" hint="Raw HTML. Leave blank to use upstream content.">
            <textarea
              value={contentHtml}
              onChange={(e) => setContentHtml(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 rounded-md border border-gray-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700 resize-y"
            />
          </Field>

          <Field label="Tags" hint="Comma-separated">
            <input
              type="text"
              value={tagsCsv}
              onChange={(e) => setTagsCsv(e.target.value)}
              placeholder="tag1, tag2, tag3"
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
            />
          </Field>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              className="h-4 w-4 rounded-md border-gray-300 text-brand-700 focus:ring-brand-700"
            />
            <span className="text-sm text-gray-700">
              Hide this article from the public app
            </span>
          </label>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3 rounded-b-lg">
          <div>
            {hasOverride && (
              <button
                type="button"
                onClick={revert}
                disabled={busy}
                className="text-sm text-red-600 hover:underline disabled:opacity-50 min-h-[44px]"
              >
                {reverting ? 'Reverting…' : 'Revert to WordPress'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-700 hover:bg-brand-700/90 rounded-md disabled:opacity-50 min-h-[44px] whitespace-nowrap"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

// =============================================================================
// ImageUpload — preview + Upload button + URL fallback. Accepts any image/*.
// =============================================================================

function ImageUpload({
  kind,
  value,
  onChange,
  previewClassName = 'w-16 h-16 rounded-md',
}: {
  kind: 'author' | 'featured';
  value: string;
  onChange: (url: string) => void;
  previewClassName?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reactId = useId();
  const inputId = `img-upload-${kind}-${reactId}`;

  async function handleFile(file: File) {
    setErr(null);
    if (file.size > 8 * 1024 * 1024) {
      setErr('File too large (max 8 MB)');
      return;
    }
    if (file.type && !file.type.startsWith('image/')) {
      setErr(`Not an image (${file.type})`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/admin/articles/upload-image', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      onChange(body.url as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className={`${previewClassName} object-cover bg-gray-100 border border-gray-200 flex-shrink-0`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            className={`${previewClassName} bg-gray-100 border border-dashed border-gray-300 flex-shrink-0 flex items-center justify-center text-[10px] text-gray-400 uppercase tracking-wide`}
            aria-hidden="true"
          >
            No image
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor={inputId}
              className={`inline-flex items-center gap-1.5 cursor-pointer px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 min-h-[44px] ${
                uploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {uploading ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                  Uploading…
                </>
              ) : (
                <>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {value ? 'Replace' : 'Upload'}
                </>
              )}
              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                disabled={uploading}
                className="text-xs text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="or paste image URL…"
            className="w-full px-3 py-1.5 rounded-md border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
