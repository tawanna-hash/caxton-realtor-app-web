'use client';

// Admin feature articles manager.
// Editorial pieces tied to an advertiser; they render on that advertiser's
// public detail page beneath the event photo gallery.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, Plus, Pencil, ChevronDown, ExternalLink, X, FileText } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';

type FeatureArticle = {
  id: number;
  advertiserId: number;
  title: string;
  excerpt: string | null;
  content: string | null;
  imageUrl: string | null;
  articleUrl: string | null;
  author: string | null;
  publishedAt: string;
  sortOrder: number;
  status: string;
  createdAt: string;
};

type PickerAdvertiser = {
  id: number;
  name: string;
  slug: string;
};

type FormState = {
  advertiserId: number | null;
  title: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  articleUrl: string;
  author: string;
  publishedAt: string;
  sortOrder: string;
  status: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  advertiserId: null,
  title: '',
  excerpt: '',
  content: '',
  imageUrl: '',
  articleUrl: '',
  author: '',
  publishedAt: today(),
  sortOrder: '0',
  status: 'published',
});

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export default function AdminFeatureArticlesPage() {
  const [articles, setArticles] = useState<FeatureArticle[] | null>(null);
  const [advertisers, setAdvertisers] = useState<PickerAdvertiser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterAdvertiser, setFilterAdvertiser] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Modal state — `editingId` null means "creating a new article".
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Bumping the key re-runs the fetch effect — mutations call reload() rather
  // than duplicating the request logic.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = filterAdvertiser ? `?advertiserId=${filterAdvertiser}` : '';
        const res = await fetch(`/api/admin/feature-articles${qs}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setArticles(data.articles ?? []);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setArticles([]);
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [filterAdvertiser, reloadKey]);

  // Advertisers populate the filter and the form's required picker. A failure
  // here is non-fatal — the list still renders, just without names.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/advertisers/picker', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json() as { advertisers?: PickerAdvertiser[] };
        if (!cancelled) setAdvertisers(data.advertisers ?? []);
      } catch {
        // Ignored — names fall back to the raw id.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const advertiser = (id: number) => advertisers.find((a) => a.id === id) ?? null;

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm(), advertiserId: filterAdvertiser });
    setShowForm(true);
  };

  const openEdit = (a: FeatureArticle) => {
    setEditingId(a.id);
    setForm({
      advertiserId: a.advertiserId,
      title: a.title,
      excerpt: a.excerpt ?? '',
      content: a.content ?? '',
      imageUrl: a.imageUrl ?? '',
      articleUrl: a.articleUrl ?? '',
      author: a.author ?? '',
      publishedAt: a.publishedAt.slice(0, 10),
      sortOrder: String(a.sortOrder),
      status: a.status,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.advertiserId) { setError('Pick an partner for this article.'); return; }
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        advertiserId: form.advertiserId,
        title: form.title.trim(),
        excerpt: form.excerpt.trim(),
        content: form.content.trim(),
        imageUrl: form.imageUrl.trim(),
        articleUrl: form.articleUrl.trim(),
        author: form.author.trim(),
        publishedAt: form.publishedAt || today(),
        sortOrder: Number(form.sortOrder) || 0,
        status: form.status,
      };
      const res = await fetch(
        editingId ? `/api/admin/feature-articles/${editingId}` : '/api/admin/feature-articles',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
      setShowForm(false);
      setEditingId(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this feature article? This cannot be undone.')) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feature-articles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">Admin</p>
          <PageTitle size="md">Feature Articles</PageTitle>
          <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
            Editorial pieces tied to an partner. Published articles appear on that
            partner&apos;s public detail page beneath their event photos.
          </p>
        </div>
        <button onClick={openCreate}
          className="shrink-0 inline-flex items-center gap-2 bg-brand-700 text-white px-5 py-2 text-sm font-medium hover:bg-brand-800 rounded-md transition-colors whitespace-nowrap self-start">
          <Plus size={16} /> Add Article
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Filter</h2>
        </div>
        <div className="max-w-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1">Partner</label>
          <AdvertiserPicker
            advertisers={advertisers}
            value={filterAdvertiser}
            onChange={setFilterAdvertiser}
            placeholder="All partners"
          />
        </div>
      </div>

      {articles === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : articles.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No feature articles yet.</p>
          <button onClick={openCreate} className="mt-3 text-sm font-medium text-brand-700 hover:text-brand-800 underline">
            Add the first one
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {articles.map((a) => {
            const adv = advertiser(a.advertiserId);
            return (
              <li key={a.id} className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4">
                <div className="shrink-0 w-24 h-24 bg-gray-100 border border-gray-200 rounded-md overflow-hidden">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-gray-300" aria-hidden="true">
                      <FileText size={22} />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{a.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {adv ? adv.name : `Advertiser #${a.advertiserId}`}
                        {' · '}{formatDate(a.publishedAt)}
                        {a.author ? ` · ${a.author}` : ''}
                        {' · '}sort {a.sortOrder}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.status === 'draft' && (
                        <span className="text-[10px] uppercase tracking-[0.15em] font-medium px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          Draft
                        </span>
                      )}
                      {adv && (
                        <a href={`/advertisers/${adv.slug}`} target="_blank" rel="noopener"
                          className="text-gray-400 hover:text-gray-700" title="View partner page">
                          <ExternalLink size={15} />
                        </a>
                      )}
                      <button onClick={() => openEdit(a)} className="text-gray-400 hover:text-brand-700" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(a.id)} disabled={deleting === a.id}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-40" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {a.excerpt && (
                    <p className="mt-2 text-sm text-gray-600 font-light line-clamp-2">{a.excerpt}</p>
                  )}
                  {a.articleUrl && (
                    <a href={a.articleUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800 underline truncate max-w-full">
                      {a.articleUrl}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !submitting && setShowForm(false)}>
          <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg w-full max-w-2xl my-8 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? 'Edit Feature Article' : 'Add Feature Article'}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Partner *</label>
                <AdvertiserPicker advertisers={advertisers} value={form.advertiserId}
                  onChange={(id) => setForm((f) => ({ ...f, advertiserId: id }))}
                  placeholder="Select a partner" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={form.title} required
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Excerpt <span className="text-gray-400">(optional)</span>
                </label>
                <textarea value={form.excerpt} rows={2}
                  onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content <span className="text-gray-400">(optional — markdown)</span>
                </label>
                <textarea value={form.content} rows={6}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hero Image URL <span className="text-gray-400">(optional)</span>
                </label>
                <input type="url" value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Article URL <span className="text-gray-400">(optional)</span>
                </label>
                <input type="url" value={form.articleUrl}
                  onChange={(e) => setForm((f) => ({ ...f, articleUrl: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Author <span className="text-gray-400">(optional)</span>
                </label>
                <input type="text" value={form.author}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Published Date *</label>
                <input type="date" value={form.publishedAt} required
                  onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input type="number" value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button type="submit" disabled={submitting}
                className="inline-flex items-center gap-2 bg-brand-700 text-white px-5 py-2 text-sm font-medium hover:bg-brand-800 rounded-md transition-colors disabled:opacity-40">
                {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Create Article'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} disabled={submitting}
                className="border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Searchable single-select. A native <select> would be unusable once the
// advertiser list grows into the hundreds, so this filters by typed query.
function AdvertiserPicker({
  advertisers,
  value,
  onChange,
  placeholder = 'All partners',
}: {
  advertisers: PickerAdvertiser[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const selected = advertisers.find((a) => a.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q ? advertisers.filter((a) => a.name.toLowerCase().includes(q)) : advertisers;

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => { setOpen(!open); setQuery(''); }}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-md bg-white text-left text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500">
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-56 bg-white border border-gray-200 rounded-md shadow-lg">
          <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search partners..."
            className="w-full border-b border-gray-200 px-3 py-2 text-xs focus:outline-none" />
          <ul className="max-h-56 overflow-y-auto py-1">
            <li>
              <button type="button" onClick={() => { onChange(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                {placeholder}
              </button>
            </li>
            {filtered.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => { onChange(a.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 truncate ${a.id === value ? 'text-brand-700 font-medium' : 'text-gray-800'}`}>
                  {a.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400">
                {advertisers.length === 0 ? 'No partners available' : 'No matches'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
