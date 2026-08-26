'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  AudioLines,
  Check,
  ExternalLink,
  FileText,
  Search,
  Star,
  Trash2,
  Video,
} from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { getApiBase } from '@/lib/api-base';
import { PUBLICATIONS, type PublicationId } from '@/lib/publications';
import PageTitle from '@/components/ui/PageTitle';

type Status = 'pending' | 'published' | 'archived';
type AdminTestimonial = {
  id: string;
  quote: string;
  client_name: string;
  client_title: string | null;
  client_company: string | null;
  rating: number | null;
  format: 'text' | 'audio' | 'video';
  video_url: string | null;
  tags: string[];
  markets: PublicationId[];
  is_global: boolean;
  status: Status;
  sort_order: number;
  submitted_via: string;
  created_at: string;
  owner_name: string;
  owner_email: string;
  owner_slug: string;
};

const API_BASE = getApiBase();

function badge(status: Status): string {
  if (status === 'published') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-gray-200 bg-gray-100 text-gray-600';
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Request failed.');
  return data;
}

export default function AdminTestimonialsPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [items, setItems] = useState<AdminTestimonial[]>([]);
  const [status, setStatus] = useState<Status | 'all'>('pending');
  const [market, setMarket] = useState<PublicationId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (market !== 'all') params.set('market', market);
      if (search) params.set('q', search);
      const data = await api(`/admin/testimonials?${params}`);
      setItems(data.testimonials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load testimonials.');
    } finally {
      setLoading(false);
    }
  }, [admin, market, search, status]);

  useEffect(() => {
    // Admin identity is client-resolved, so the queue loads once that session is ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const counts = useMemo(() => items.reduce((result, item) => {
    result[item.status] += 1;
    return result;
  }, { pending: 0, published: 0, archived: 0 }), [items]);

  async function changeStatus(item: AdminTestimonial, nextStatus: Status) {
    setBusyId(item.id);
    setError('');
    try {
      await api(`/admin/testimonials/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          markets: item.markets,
          isGlobal: item.is_global,
          sortOrder: item.sort_order,
        }),
      });
      setNotice(`Testimonial ${nextStatus}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update testimonial.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: AdminTestimonial) {
    if (!window.confirm(`Permanently delete the testimonial from ${item.client_name}?`)) return;
    setBusyId(item.id);
    try {
      await api(`/admin/testimonials/${item.id}`, { method: 'DELETE' });
      setNotice('Testimonial deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete testimonial.');
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !admin) {
    return <main className="mx-auto max-w-6xl px-6 py-12 text-sm text-gray-500">Loading Testimonial Hub…</main>;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <PageTitle size="md">Testimonial Hub</PageTitle>
          <p className="mt-1 text-sm text-gray-500">Review subscriber testimonials and control where they appear.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5">{counts.pending} pending</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">{counts.published} published</span>
          <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5">{counts.archived} archived</span>
        </div>
      </header>

      <section aria-label="Testimonial filters" className="mt-6 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_190px_190px]">
        <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }} className="flex min-w-0 gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search testimonials</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-gray-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, subscriber, or quote" className="min-h-11 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm" />
          </label>
          <button className="min-h-11 rounded-md bg-[#301D5D] px-4 text-sm font-semibold text-white">Search</button>
        </form>
        <label>
          <span className="sr-only">Filter by status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as Status | 'all')} className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by market</span>
          <select value={market} onChange={(event) => setMarket(event.target.value as PublicationId | 'all')} className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
            <option value="all">All markets</option>
            {PUBLICATIONS.map((publication) => <option key={publication.id} value={publication.id}>{publication.market}</option>)}
          </select>
        </label>
      </section>

      {(error || notice) && <div role="status" className={`mt-4 rounded-md border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

      {loading ? (
        <div className="mt-6 space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-48 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <Check size={34} className="mx-auto text-gray-300" />
          <h2 className="mt-4 font-semibold text-gray-900">Queue is clear</h2>
          <p className="mt-2 text-sm text-gray-500">No testimonials match the current filters.</p>
        </div>
      ) : (
        <section aria-label="Testimonials" className="mt-6 space-y-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.format === 'video' ? <Video size={17} className="text-[#301D5D]" /> : item.format === 'audio' ? <AudioLines size={17} className="text-[#301D5D]" /> : <FileText size={17} className="text-[#301D5D]" />}
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${badge(item.status)}`}>{item.status}</span>
                    <span className="text-xs text-gray-500">{item.submitted_via === 'collection_link' ? 'Client submitted' : 'Subscriber added'}</span>
                  </div>
                  {item.rating && <div className="mt-3 flex gap-0.5 text-amber-500">{Array.from({ length: item.rating }).map((_, index) => <Star key={index} size={14} fill="currentColor" />)}</div>}
                  <blockquote className="mt-3 max-w-4xl text-base leading-7 text-gray-800">“{item.quote}”</blockquote>
                  <div className="mt-4 text-sm font-semibold text-gray-950">{item.client_name}</div>
                  {(item.client_title || item.client_company) && <div className="mt-0.5 text-sm text-gray-500">{[item.client_title, item.client_company].filter(Boolean).join(', ')}</div>}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{item.is_global ? 'Global' : item.markets.map((id) => PUBLICATIONS.find((publication) => publication.id === id)?.market).filter(Boolean).join(', ')}</span>
                    {item.tags.map((tag) => <span key={tag} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-500">#{tag}</span>)}
                  </div>
                </div>
                <aside className="border-t border-gray-100 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Subscriber</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{item.owner_name}</div>
                  <div className="mt-0.5 break-all text-xs text-gray-500">{item.owner_email}</div>
                  <Link href={`/testimonials/${item.owner_slug}`} target="_blank" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#301D5D]"><ExternalLink size={15} /> Open showcase</Link>
                  <div className="mt-4 grid gap-2">
                    {item.status !== 'published' && <button disabled={busyId === item.id} onClick={() => void changeStatus(item, 'published')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Check size={16} /> Publish</button>}
                    {item.status !== 'archived' && <button disabled={busyId === item.id} onClick={() => void changeStatus(item, 'archived')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 disabled:opacity-50"><Archive size={16} /> Archive</button>}
                    <button disabled={busyId === item.id} onClick={() => void remove(item)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 size={16} /> Delete</button>
                  </div>
                </aside>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
