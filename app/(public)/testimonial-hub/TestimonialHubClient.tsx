'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Quote,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getApiBase } from '@/lib/api-base';
import { PUBLICATIONS, type PublicationId } from '@/lib/publications';

type Profile = {
  realtor_id: string;
  slug: string;
  collection_token: string;
  display_name: string;
  professional_title: string | null;
  company: string | null;
  bio: string | null;
  headshot_url: string | null;
  default_market: PublicationId;
  default_global: boolean;
  is_published: boolean;
};

type Testimonial = {
  id: string;
  quote: string;
  client_name: string;
  client_title: string | null;
  client_company: string | null;
  rating: number | null;
  format: 'text' | 'video';
  video_url: string | null;
  image_url: string | null;
  transcript: string | null;
  source_url: string | null;
  tags: string[];
  markets: PublicationId[];
  is_global: boolean;
  status: 'pending' | 'published' | 'archived';
  sort_order: number;
  submitted_via: 'owner' | 'collection_link' | 'admin';
  created_at: string;
};

type FormState = {
  quote: string;
  clientName: string;
  clientTitle: string;
  clientCompany: string;
  rating: string;
  format: 'text' | 'video';
  videoUrl: string;
  imageUrl: string;
  transcript: string;
  sourceUrl: string;
  tags: string;
  markets: PublicationId[];
  isGlobal: boolean;
  status: 'pending' | 'published' | 'archived';
  sortOrder: number;
};

const API_BASE = getApiBase();
const EMPTY_FORM: FormState = {
  quote: '',
  clientName: '',
  clientTitle: '',
  clientCompany: '',
  rating: '',
  format: 'text',
  videoUrl: '',
  imageUrl: '',
  transcript: '',
  sourceUrl: '',
  tags: '',
  markets: ['austin'],
  isGlobal: false,
  status: 'published',
  sortOrder: 0,
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Something went wrong.');
  return data;
}

function statusClass(status: Testimonial['status']): string {
  if (status === 'published') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

export default function TestimonialHubClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'headshot' | 'client' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request('/testimonial-hub');
      setProfile(data.profile);
      setItems(data.testimonials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the hub.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // This client dashboard intentionally fetches its authenticated data after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    published: items.filter((item) => item.status === 'published').length,
    pending: items.filter((item) => item.status === 'pending').length,
    archived: items.filter((item) => item.status === 'archived').length,
  }), [items]);

  const collectionUrl = typeof window !== 'undefined' && profile
    ? `${window.location.origin}/testimonial/submit/${profile.collection_token}`
    : '';
  const showcaseUrl = typeof window !== 'undefined' && profile
    ? `${window.location.origin}/testimonials/${profile.slug}`
    : '';

  function startNew() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      markets: profile?.default_global ? [] : [profile?.default_market ?? 'austin'],
      isGlobal: profile?.default_global ?? false,
    });
    setShowEditor(true);
    setNotice('');
  }

  function startEdit(item: Testimonial) {
    setEditingId(item.id);
    setForm({
      quote: item.quote,
      clientName: item.client_name,
      clientTitle: item.client_title ?? '',
      clientCompany: item.client_company ?? '',
      rating: item.rating ? String(item.rating) : '',
      format: item.format,
      videoUrl: item.video_url ?? '',
      imageUrl: item.image_url ?? '',
      transcript: item.transcript ?? '',
      sourceUrl: item.source_url ?? '',
      tags: item.tags.join(', '),
      markets: item.markets,
      isGlobal: item.is_global,
      status: item.status,
      sortOrder: item.sort_order,
    });
    setShowEditor(true);
    setNotice('');
  }

  function toggleMarket(market: PublicationId) {
    setForm((current) => ({
      ...current,
      isGlobal: false,
      markets: current.markets.includes(market)
        ? current.markets.filter((item) => item !== market)
        : [...current.markets, market],
    }));
  }

  async function saveTestimonial(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        rating: form.rating ? Number(form.rating) : null,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      };
      await request(
        editingId ? `/testimonial-hub/testimonials/${editingId}` : '/testimonial-hub/testimonials',
        { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(body) },
      );
      setNotice(editingId ? 'Testimonial updated.' : 'Testimonial added to your library.');
      setShowEditor(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save.');
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setError('');
    try {
      const data = await request('/testimonial-hub', {
        method: 'PUT',
        body: JSON.stringify({
          display_name: profile.display_name,
          professional_title: profile.professional_title,
          company: profile.company,
          bio: profile.bio,
          headshot_url: profile.headshot_url,
          default_market: profile.default_market,
          default_global: profile.default_global,
          is_published: profile.is_published,
        }),
      });
      setProfile(data.profile);
      setNotice('Showcase settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save.');
    } finally {
      setSaving(false);
    }
  }

  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    setNotice(message);
  }

  async function uploadImage(file: File, kind: 'headshot' | 'client') {
    setUploading(kind);
    setError('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('kind', kind);
      const response = await fetch(`${API_BASE}/testimonial-hub/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to upload image.');
      if (kind === 'headshot') {
        setProfile((current) => current ? { ...current, headshot_url: data.url } : current);
      } else {
        setForm((current) => ({ ...current, imageUrl: data.url }));
      }
      setNotice('Image uploaded. Save your changes when ready.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload image.');
    } finally {
      setUploading(null);
    }
  }

  async function rotateLink() {
    if (!window.confirm('Create a new collection link? The current link will stop working.')) return;
    const data = await request('/testimonial-hub', { method: 'POST' });
    setProfile(data.profile);
    setNotice('A new collection link is ready.');
  }

  async function remove(item: Testimonial) {
    if (!window.confirm(`Delete the testimonial from ${item.client_name}?`)) return;
    await request(`/testimonial-hub/testimonials/${item.id}`, { method: 'DELETE' });
    setNotice('Testimonial deleted.');
    await load();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      </main>
    );
  }

  if (!profile) {
    return <main className="mx-auto max-w-4xl px-6 py-16 text-center text-gray-600">{error || 'Unable to open Testimonial Hub.'}</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-5 border-b border-gray-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#301D5D]">Subscriber tools</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">Testimonial Hub</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Collect client feedback, organize your library, and publish a shareable proof page.
          </p>
        </div>
        <button onClick={startNew} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#241547]">
          <Plus size={17} /> Add testimonial
        </button>
      </header>

      {(error || notice) && (
        <div role="status" className={`mt-5 rounded-md border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || notice}
        </div>
      )}

      <section aria-label="Testimonial totals" className="mt-7 grid gap-3 sm:grid-cols-3">
        {([
          { label: 'Published', value: counts.published, icon: Check },
          { label: 'Awaiting review', value: counts.pending, icon: Quote },
          { label: 'Archived', value: counts.archived, icon: Archive },
        ] satisfies Array<{ label: string; value: number; icon: LucideIcon }>).map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Icon size={18} className="text-[#301D5D]" />
            <div className="mt-4 text-2xl font-semibold text-gray-950">{value}</div>
            <div className="mt-1 text-sm text-gray-500">{label}</div>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Your library</h2>
              <p className="mt-1 text-sm text-gray-500">{items.length} saved testimonial{items.length === 1 ? '' : 's'}</p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
              <Quote className="mx-auto text-gray-300" size={34} />
              <h3 className="mt-4 font-semibold text-gray-900">Your best client stories belong here</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">Add one yourself, or copy your collection link and send it to a client.</p>
              <button onClick={startNew} className="mt-5 min-h-11 rounded-md bg-[#301D5D] px-4 text-sm font-semibold text-white">Add your first testimonial</button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {item.format === 'video' ? <Video size={17} className="text-[#301D5D]" /> : <FileText size={17} className="text-[#301D5D]" />}
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(item.status)}`}>{item.status}</span>
                      {item.submitted_via === 'collection_link' && <span className="text-xs text-gray-500">Client submitted</span>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(item)} aria-label={`Edit testimonial from ${item.client_name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"><Pencil size={16} /></button>
                      <button onClick={() => void remove(item)} aria-label={`Delete testimonial from ${item.client_name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {item.rating && (
                    <div className="mt-3 flex gap-0.5 text-amber-500" aria-label={`${item.rating} out of 5 stars`}>
                      {Array.from({ length: item.rating }).map((_, index) => <Star key={index} size={14} fill="currentColor" />)}
                    </div>
                  )}
                  <blockquote className="mt-3 text-base leading-7 text-gray-800">“{item.quote}”</blockquote>
                  <div className="mt-4 text-sm font-semibold text-gray-950">{item.client_name}</div>
                  {(item.client_title || item.client_company) && <div className="mt-0.5 text-sm text-gray-500">{[item.client_title, item.client_company].filter(Boolean).join(', ')}</div>}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{item.is_global ? 'Global' : item.markets.map((market) => PUBLICATIONS.find((pub) => pub.id === market)?.market).join(', ')}</span>
                    {item.tags.map((tag) => <span key={tag} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-500">#{tag}</span>)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-950">Collect testimonials</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">Share this link with clients. New responses arrive as pending for review.</p>
            <div className="mt-4 break-all rounded-md bg-gray-50 p-3 text-xs leading-5 text-gray-600">{collectionUrl}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => void copy(collectionUrl, 'Collection link copied.')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"><Clipboard size={15} /> Copy</button>
              <button onClick={() => void rotateLink()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"><RotateCcw size={15} /> Replace</button>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-950">Public showcase</h2>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-gray-800">
              Published
              <input type="checkbox" checked={profile.is_published} onChange={(event) => setProfile({ ...profile, is_published: event.target.checked })} className="h-5 w-5 accent-[#301D5D]" />
            </label>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Display name
              <input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" />
            </label>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Professional title
              <input value={profile.professional_title ?? ''} onChange={(event) => setProfile({ ...profile, professional_title: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" />
            </label>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Company
              <input value={profile.company ?? ''} onChange={(event) => setProfile({ ...profile, company: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" />
            </label>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Headshot URL
              <input type="url" value={profile.headshot_url ?? ''} onChange={(event) => setProfile({ ...profile, headshot_url: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" />
            </label>
            <label className="mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Upload size={15} />
              {uploading === 'headshot' ? 'Uploading…' : 'Upload headshot'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file, 'headshot');
                  event.target.value = '';
                }}
                className="sr-only"
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Short introduction
              <textarea rows={3} value={profile.bio ?? ''} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Default market
              <select value={profile.default_market} onChange={(event) => setProfile({ ...profile, default_market: event.target.value as PublicationId })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
                {PUBLICATIONS.map((publication) => <option key={publication.id} value={publication.id}>{publication.market}</option>)}
              </select>
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={profile.default_global} onChange={(event) => setProfile({ ...profile, default_global: event.target.checked })} className="h-5 w-5 accent-[#301D5D]" />
              Default new testimonials to global
            </label>
            <button onClick={() => void saveProfile()} disabled={saving} className="mt-5 min-h-11 w-full rounded-md bg-[#301D5D] px-4 text-sm font-semibold text-white disabled:opacity-50">Save showcase</button>
            {profile.is_published && (
              <a href={showcaseUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <ExternalLink size={15} /> View public page
              </a>
            )}
          </section>
        </aside>
      </section>

      {showEditor && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="testimonial-editor-title">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div>
                <h2 id="testimonial-editor-title" className="text-lg font-semibold text-gray-950">{editingId ? 'Edit testimonial' : 'Add testimonial'}</h2>
                <p className="mt-0.5 text-sm text-gray-500">Save text, video, rating, attribution, and market details.</p>
              </div>
              <button onClick={() => setShowEditor(false)} aria-label="Close testimonial editor" className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={saveTestimonial} className="grid gap-5 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm font-medium text-gray-700">
                Testimonial
                <textarea required minLength={10} rows={5} value={form.quote} onChange={(event) => setForm({ ...form, quote: event.target.value })} className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-base" placeholder="What did your client say?" />
              </label>
              <label className="text-sm font-medium text-gray-700">Client name<input required value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" /></label>
              <label className="text-sm font-medium text-gray-700">Client company<input value={form.clientCompany} onChange={(event) => setForm({ ...form, clientCompany: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" /></label>
              <label className="text-sm font-medium text-gray-700">Client title<input value={form.clientTitle} onChange={(event) => setForm({ ...form, clientTitle: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" /></label>
              <label className="text-sm font-medium text-gray-700">Rating<select value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"><option value="">No rating</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-gray-700">Format</legend>
                <div className="mt-2 flex gap-2">
                  {(['text', 'video'] as const).map((format) => <button key={format} type="button" onClick={() => setForm({ ...form, format })} className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium capitalize ${form.format === format ? 'border-[#301D5D] bg-[#301D5D]/5 text-[#301D5D]' : 'border-gray-300 text-gray-600'}`}>{format === 'video' ? <Video size={16} /> : <FileText size={16} />}{format}</button>)}
                </div>
              </fieldset>
              {form.format === 'video' && <label className="sm:col-span-2 text-sm font-medium text-gray-700">Video URL<input required type="url" value={form.videoUrl} onChange={(event) => setForm({ ...form, videoUrl: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" placeholder="https://…" /></label>}
              <div>
                <label className="text-sm font-medium text-gray-700">Client photo URL<input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" placeholder="https://…" /></label>
                <label className="mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Upload size={15} />
                  {uploading === 'client' ? 'Uploading…' : 'Upload client photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file, 'client');
                      event.target.value = '';
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
              <label className="text-sm font-medium text-gray-700">Original source URL<input type="url" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" placeholder="https://…" /></label>
              <label className="sm:col-span-2 text-sm font-medium text-gray-700">Video transcript or notes<textarea rows={3} value={form.transcript} onChange={(event) => setForm({ ...form, transcript: event.target.value })} className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" /></label>
              <label className="sm:col-span-2 text-sm font-medium text-gray-700">Tags<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" placeholder="buyer, first-time homebuyer, relocation" /></label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-gray-700">Visibility</legend>
                <label className="mt-2 flex min-h-11 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-700">
                  <input type="checkbox" checked={form.isGlobal} onChange={(event) => setForm({ ...form, isGlobal: event.target.checked, markets: event.target.checked ? [] : form.markets })} className="h-5 w-5 accent-[#301D5D]" />
                  Show in every market
                </label>
                {!form.isGlobal && <div className="mt-2 grid gap-2 sm:grid-cols-2">{PUBLICATIONS.map((publication) => <label key={publication.id} className="flex min-h-11 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-700"><input type="checkbox" checked={form.markets.includes(publication.id)} onChange={() => toggleMarket(publication.id)} className="h-5 w-5 accent-[#301D5D]" />{publication.market}</label>)}</div>}
              </fieldset>
              <label className="text-sm font-medium text-gray-700">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState['status'] })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"><option value="published">Published</option><option value="pending">Pending</option><option value="archived">Archived</option></select></label>
              <label className="text-sm font-medium text-gray-700">Display order<input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3 text-sm" /></label>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-5 sm:col-span-2">
                <button type="button" onClick={() => setShowEditor(false)} className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-700">Cancel</button>
                <button disabled={saving || (!form.isGlobal && form.markets.length === 0)} className="min-h-11 rounded-md bg-[#301D5D] px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save testimonial'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
