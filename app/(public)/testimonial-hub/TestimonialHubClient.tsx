'use client';

import MasterDetail from '../agents/MasterDetail';
import SectionNav from '../agents/SectionNav';
import Switch from '../agents/Switch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  AudioLines,
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

type Profile = {
  realtor_id: string;
  slug: string;
  collection_token: string;
  display_name: string;
  professional_title: string | null;
  company: string | null;
  location: string | null;
  bio: string | null;
  headshot_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  x_url: string | null;
  youtube_url: string | null;
  linkedin_url: string | null;
  featured_links: Array<{ label: string; url: string }>;
  is_published: boolean;
};

type Testimonial = {
  id: string;
  quote: string;
  client_name: string;
  client_title: string | null;
  client_company: string | null;
  rating: number | null;
  format: 'text' | 'audio' | 'video';
  video_url: string | null;
  image_url: string | null;
  transcript: string | null;
  source_url: string | null;
  tags: string[];
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
  format: 'text' | 'audio' | 'video';
  videoUrl: string;
  imageUrl: string;
  transcript: string;
  sourceUrl: string;
  tags: string;
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
  if (status === 'published') return 'bg-[#E0FBE0] text-[#005A00] border-[#00E200]/30';
  if (status === 'pending') return 'bg-[#FEF8CC] text-[#645600] border-[#FAD800]/30';
  return 'bg-[#EFEAF8] text-[#4A4757] border-[#E6E5EC]';
}

const BTN = 'inline-flex min-h-[36px] items-center justify-center gap-2 rounded-md border border-[#E6E5EC] bg-white px-3 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';
const LABEL = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]';

export default function TestimonialHubClient({ eyebrow }: { eyebrow?: string } = {}) {
  const embedded = Boolean(eyebrow);
  const CARD = embedded ? 'ds-card' : 'rounded-xl border border-[#E6E5EC] bg-white p-4';
  const Tag = embedded ? 'div' : 'main';
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
  const [embedLayout, setEmbedLayout] = useState<'grid' | 'carousel' | 'single'>('grid');
  const [embedTheme, setEmbedTheme] = useState<'light' | 'dark'>('light');

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
  const embedCode = typeof window !== 'undefined' && profile
    ? `<script async src="${window.location.origin}/api/testimonial-widget?slug=${encodeURIComponent(profile.slug)}&layout=${embedLayout}&theme=${embedTheme}"></script>`
    : '';

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
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
      status: item.status,
      sortOrder: item.sort_order,
    });
    setShowEditor(true);
    setNotice('');
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
        markets: [],
        isGlobal: true,
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
          slug: profile.slug,
          display_name: profile.display_name,
          professional_title: profile.professional_title,
          company: profile.company,
          location: profile.location,
          bio: profile.bio,
          headshot_url: profile.headshot_url,
          website_url: profile.website_url,
          instagram_url: profile.instagram_url,
          x_url: profile.x_url,
          youtube_url: profile.youtube_url,
          linkedin_url: profile.linkedin_url,
          featured_links: profile.featured_links,
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

  function updateFeaturedLink(index: number, key: 'label' | 'url', value: string) {
    if (!profile) return;
    const featuredLinks = profile.featured_links.map((link, linkIndex) => (
      linkIndex === index ? { ...link, [key]: value } : link
    ));
    setProfile({ ...profile, featured_links: featuredLinks });
  }

  function removeFeaturedLink(index: number) {
    if (!profile) return;
    setProfile({
      ...profile,
      featured_links: profile.featured_links.filter((_, linkIndex) => linkIndex !== index),
    });
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
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-[#EFEAF8]" />)}
        </div>
      </main>
    );
  }

  if (!profile) {
    return <main className="mx-auto max-w-4xl px-6 py-16 text-center text-[#4A4757]">{error || 'Unable to open Testimonial Hub.'}</main>;
  }

  const libraryBlock = (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[#1B1726]">Your Library</h2>
              <p className="mt-1 text-sm text-[#7A7787]">{items.length} saved testimonial{items.length === 1 ? '' : 's'}</p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E6E5EC] bg-white px-6 py-14 text-center">
              <Quote className="mx-auto text-[#C9C5D6]" size={34} />
              <h3 className="mt-4 font-semibold text-[#1B1726]">Your Best Client Stories Belong Here</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7A7787]">Add one yourself, or copy your collection link and send it to a client.</p>
              <button onClick={startNew} className={`${BTN} mt-4`}>Add Your First Testimonial</button>
            </div>
          ) : (
            <MasterDetail
              testId="testimonials-list"
              backLabel="Testimonials"
              empty={null}
              items={items.map((item) => ({ id: String(item.id), title: item.client_name, sub: item.quote, trailing: item.status }))}
              renderDetail={(id) => {
                const item = items.find((x) => String(x.id) === id);
                if (!item) return null;
                return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {item.format === 'video' ? <Video size={17} className="text-[#301D5D]" /> : item.format === 'audio' ? <AudioLines size={17} className="text-[#301D5D]" /> : <FileText size={17} className="text-[#301D5D]" />}
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusClass(item.status)}`}>{item.status}</span>
                      {item.submitted_via === 'collection_link' && <span className="text-xs text-[#7A7787]">Client submitted</span>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(item)} aria-label={`Edit testimonial from ${item.client_name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[#7A7787] hover:!bg-[#EFEAF8] hover:text-[#1B1726]"><Pencil size={16} /></button>
                      <button onClick={() => void remove(item)} aria-label={`Delete testimonial from ${item.client_name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[#7A7787] hover:bg-[#FFEAE6] hover:text-[#661102]"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {item.rating && (
                    <div className="mt-3 flex gap-0.5 text-[#645600]" aria-label={`${item.rating} out of 5 stars`}>
                      {Array.from({ length: item.rating }).map((_, index) => <Star key={index} size={14} fill="currentColor" />)}
                    </div>
                  )}
                  <blockquote className="mt-3 text-base leading-7 text-[#1B1726]">“{item.quote}”</blockquote>
                  <div className="mt-4 text-sm font-semibold text-[#1B1726]">{item.client_name}</div>
                  {(item.client_title || item.client_company) && <div className="mt-0.5 text-sm text-[#7A7787]">{[item.client_title, item.client_company].filter(Boolean).join(', ')}</div>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.tags.map((tag) => <span key={tag} className="rounded bg-[#F6F3FB] px-2 py-1 text-xs text-[#7A7787]">#{tag}</span>)}
                  </div>
                </div>
                );
              }}
            />
          )}
        </div>
  );
  const collectBlock = (
          <section className={CARD}>
            <h2 className="text-[15px] font-semibold text-[#1B1726]">Collect Testimonials</h2>
            <p className="mt-2 text-sm leading-6 text-[#7A7787]">Share this link with clients. New responses arrive as pending for review.</p>
            <div className="mt-4 break-all rounded-md bg-[#F6F3FB] p-3 text-xs leading-5 text-[#4A4757]">{collectionUrl}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => void copy(collectionUrl, 'Collection link copied.')} className={BTN}><Clipboard size={15} /> Copy</button>
              <button onClick={() => void rotateLink()} className={BTN}><RotateCcw size={15} /> Replace</button>
            </div>
          </section>
  );
  const profileBlock = (
          <section className={CARD}>
            <h2 className="text-[15px] font-semibold text-[#1B1726]">Profile Settings</h2>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-[#1B1726]">
              Published
              <Switch on={profile.is_published} label="Published" onChange={(next) => setProfile({ ...profile, is_published: next })} />
            </label>
            <label className={`mt-4 block ${LABEL}`}>
              Display Name
              <input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" />
            </label>
            <label className={`mt-4 block ${LABEL}`}>
              Username
              <div className="mt-2 flex min-h-11 overflow-hidden rounded-md border border-[#E6E5EC] bg-white">
                <span className="flex items-center border-r border-[#E6E5EC] bg-[#F6F3FB] px-3 text-xs text-[#7A7787]">/testimonials/</span>
                <input value={profile.slug} onChange={(event) => setProfile({ ...profile, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="min-w-0 flex-1 px-3 text-sm outline-none" />
              </div>
            </label>
            <label className={`mt-4 block ${LABEL}`}>
              Professional Title
              <input value={profile.professional_title ?? ''} onChange={(event) => setProfile({ ...profile, professional_title: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" />
            </label>
            <label className={`mt-4 block ${LABEL}`}>
              Company
              <input value={profile.company ?? ''} onChange={(event) => setProfile({ ...profile, company: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" />
            </label>
            <label className={`mt-4 block ${LABEL}`}>
              Location
              <input value={profile.location ?? ''} onChange={(event) => setProfile({ ...profile, location: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" placeholder="Austin, Texas" />
            </label>
            <label className={`mt-4 block ${LABEL}`}>
              Headshot URL
              <input type="url" value={profile.headshot_url ?? ''} onChange={(event) => setProfile({ ...profile, headshot_url: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" />
            </label>
            <label className={`${BTN} mt-2 w-full cursor-pointer`}>
              <Upload size={15} />
              {uploading === 'headshot' ? 'Uploading…' : 'Upload Headshot'}
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
            <label className={`mt-4 block ${LABEL}`}>
              Short Introduction
              <textarea rows={3} value={profile.bio ?? ''} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} className="mt-2 w-full rounded-md border border-[#E6E5EC] px-3 py-2 text-sm" />
            </label>
            <label className={`mt-4 block ${LABEL}`}>
              Subscriber Website
              <input type="url" value={profile.website_url ?? ''} onChange={(event) => setProfile({ ...profile, website_url: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" placeholder="https://yourwebsite.com" />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([
                ['Instagram', 'instagram_url', 'https://instagram.com/…'],
                ['X / Twitter', 'x_url', 'https://x.com/…'],
                ['YouTube', 'youtube_url', 'https://youtube.com/…'],
                ['LinkedIn', 'linkedin_url', 'https://linkedin.com/in/…'],
              ] as const).map(([label, key, placeholder]) => (
                <label key={key} className={`block ${LABEL}`}>
                  {label}
                  <input type="url" value={profile[key] ?? ''} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" placeholder={placeholder} />
                </label>
              ))}
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className={LABEL}>Featured Links</h3>
                <button
                  type="button"
                  onClick={() => setProfile({ ...profile, featured_links: [...profile.featured_links, { label: '', url: '' }] })}
                  disabled={profile.featured_links.length >= 8}
                  className={BTN}
                >
                  <Plus size={15} /> Add Link
                </button>
              </div>
              <div className="space-y-3">
                {profile.featured_links.map((link, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-[#E6E5EC] p-3">
                    <input value={link.label} onChange={(event) => updateFeaturedLink(index, 'label', event.target.value)} className="min-h-11 rounded-md border border-[#E6E5EC] px-3 text-sm" placeholder="Link Title" />
                    <div className="flex gap-2">
                      <input type="url" value={link.url} onChange={(event) => updateFeaturedLink(index, 'url', event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-md border border-[#E6E5EC] px-3 text-sm" placeholder="https://…" />
                      <button type="button" onClick={() => removeFeaturedLink(index)} aria-label={`Remove featured link ${index + 1}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#E6E5EC] text-[#7A7787] hover:bg-[#FFEAE6] hover:text-[#661102]"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => void saveProfile()} disabled={saving} className={`${BTN} mt-4 w-full`}>Save Profile</button>
            {profile.is_published && (
              <a href={showcaseUrl} target="_blank" rel="noreferrer" className={`${BTN} mt-3 w-full`}>
                <ExternalLink size={15} /> View Public Page
              </a>
            )}
          </section>
  );
  const embedBlock = (
          <section className={CARD}>
            <h2 className="text-[15px] font-semibold text-[#1B1726]">Embed Anywhere</h2>
            <p className="mt-2 text-sm leading-6 text-[#7A7787]">Paste this single line into your website. Newly published testimonials appear automatically without reloading the page.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={LABEL}>
                Layout
                <select
                  value={embedLayout}
                  onChange={(event) => setEmbedLayout(event.target.value as typeof embedLayout)}
                  className="mt-2 min-h-11 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm"
                  data-testid="select-testimonial-widget-layout"
                >
                  <option value="grid">Card Grid</option>
                  <option value="carousel">Carousel</option>
                  <option value="single">Featured Review</option>
                </select>
              </label>
              <label className={LABEL}>
                Theme
                <select
                  value={embedTheme}
                  onChange={(event) => setEmbedTheme(event.target.value as typeof embedTheme)}
                  className="mt-2 min-h-11 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm"
                  data-testid="select-testimonial-widget-theme"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-[#1B1726] p-3 text-xs leading-5 text-white">{embedCode}</pre>
            <button onClick={() => void copy(embedCode, 'Embed code copied.')} className={`${BTN} mt-3 w-full`}><Clipboard size={15} /> Copy Embed Code</button>
          </section>
  );

  return (
    <Tag className={embedded ? 'ct-hub space-y-4' : 'mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-8'}>
      <header className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${embedded ? '' : 'border-b border-[#E6E5EC] pb-6'}`}>
        <div>
          {embedded ? null : <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#301D5D]">Subscriber Tools</p>}
          {embedded ? <h2 className="text-[22px] font-semibold text-[#1B1726]">Testimonials Hub</h2> : <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1B1726]">Testimonials Hub</h1>}
          <p className={embedded ? 'mt-1 text-[14px] text-[#4A4757]' : 'mt-2 max-w-2xl text-sm leading-6 text-[#4A4757]'}>
            Collect client feedback, organize your library, and publish a shareable proof page.
          </p>
        </div>
        <button onClick={startNew} className={BTN}>
          <Plus size={17} /> Add Testimonial
        </button>
      </header>

      {(error || notice) && (
        <div role="status" className={`mt-4 rounded-md border px-4 py-3 text-sm ${error ? 'border-[#FF2A04]/30 bg-[#FFEAE6] text-[#661102]' : 'border-[#00E200]/30 bg-[#E0FBE0] text-[#005A00]'}`}>
          {error || notice}
        </div>
      )}

      <section aria-label="Testimonial totals" className="mt-6 grid gap-3 sm:grid-cols-3">
        {([
          { label: 'Published', value: counts.published, icon: Check },
          { label: 'Awaiting Review', value: counts.pending, icon: Quote },
          { label: 'Archived', value: counts.archived, icon: Archive },
        ] satisfies Array<{ label: string; value: number; icon: LucideIcon }>).map(({ label, value, icon: Icon }) => (
          <div key={label} className={CARD}>
            <Icon size={18} className="text-[#301D5D]" />
            <div className="mt-4 text-2xl font-semibold text-[#1B1726]">{value}</div>
            <div className="mt-1 text-sm text-[#7A7787]">{label}</div>
          </div>
        ))}
      </section>

      {embedded ? (
        <div className="mt-6">
          <SectionNav
            testId="testimonials-sections"
            backLabel="Testimonials Hub"
            sections={[
              { id: 'library', title: 'Your Library', sub: 'Saved testimonials', trailing: String(items.length), content: libraryBlock },
              { id: 'collect', title: 'Collect Testimonials', sub: 'Your collection link', content: collectBlock },
              { id: 'profile', title: 'Profile Settings', sub: 'Your public proof page', content: profileBlock },
              { id: 'embed', title: 'Embed Anywhere', sub: 'Add testimonials to your website', content: embedBlock },
            ]}
          />
        </div>
      ) : (
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        {libraryBlock}
        <aside className="space-y-4">
          {collectBlock}
          {profileBlock}
          {embedBlock}
        </aside>
      </section>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="testimonial-editor-title">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E6E5EC] bg-white px-4 py-4">
              <div>
                <h2 id="testimonial-editor-title" className="text-[16px] font-semibold text-[#1B1726]">{editingId ? 'Edit Testimonial' : 'Add Testimonial'}</h2>
                <p className="mt-0.5 text-sm text-[#7A7787]">Save text, audio, video, rating, and client attribution.</p>
              </div>
              <button onClick={() => setShowEditor(false)} aria-label="Close testimonial editor" className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[#7A7787] hover:!bg-[#EFEAF8]"><X size={20} /></button>
            </div>
            <form onSubmit={saveTestimonial} className="grid gap-4 p-4 sm:grid-cols-2">
              <label className={`sm:col-span-2 ${LABEL}`}>
                Testimonial
                <textarea required minLength={10} rows={5} value={form.quote} onChange={(event) => setForm({ ...form, quote: event.target.value })} className="mt-2 w-full rounded-md border border-[#E6E5EC] px-3 py-2 text-base" placeholder="What did your client say?" />
              </label>
              <label className={LABEL}>Client Name<input required value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" /></label>
              <label className={LABEL}>Client Company<input value={form.clientCompany} onChange={(event) => setForm({ ...form, clientCompany: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" /></label>
              <label className={LABEL}>Client Title<input value={form.clientTitle} onChange={(event) => setForm({ ...form, clientTitle: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" /></label>
              <label className={LABEL}>Rating<select value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} className="mt-2 min-h-11 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm"><option value="">No Rating</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
              <fieldset className="sm:col-span-2">
                <legend className={LABEL}>Format</legend>
                <div className="mt-2 flex gap-2">
                  {(['text', 'audio', 'video'] as const).map((format) => <button key={format} type="button" onClick={() => setForm({ ...form, format })} className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium capitalize ${form.format === format ? 'border-[#301D5D] bg-[#301D5D]/5 text-[#301D5D]' : 'border-[#E6E5EC] text-[#4A4757]'}`}>{format === 'video' ? <Video size={16} /> : format === 'audio' ? <AudioLines size={16} /> : <FileText size={16} />}{format}</button>)}
                </div>
              </fieldset>
              {form.format !== 'text' && <label className={`sm:col-span-2 ${LABEL}`}>{form.format === 'audio' ? 'Audio URL' : 'Video URL'}<input required type="url" value={form.videoUrl} onChange={(event) => setForm({ ...form, videoUrl: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" placeholder="https://…" /></label>}
              <div>
                <label className={LABEL}>Client Photo URL<input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" placeholder="https://…" /></label>
                <label className={`${BTN} mt-2 w-full cursor-pointer`}>
                  <Upload size={15} />
                  {uploading === 'client' ? 'Uploading…' : 'Upload Client Photo'}
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
              <label className={LABEL}>Original Source URL<input type="url" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" placeholder="https://…" /></label>
              <label className={`sm:col-span-2 ${LABEL}`}>Transcript Or Notes<textarea rows={3} value={form.transcript} onChange={(event) => setForm({ ...form, transcript: event.target.value })} className="mt-2 w-full rounded-md border border-[#E6E5EC] px-3 py-2 text-sm" /></label>
              <label className={`sm:col-span-2 ${LABEL}`}>Tags<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" placeholder="buyer, first-time homebuyer, relocation" /></label>
              <label className={LABEL}>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState['status'] })} className="mt-2 min-h-11 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm"><option value="published">Published</option><option value="pending">Pending</option><option value="archived">Archived</option></select></label>
              <label className={LABEL}>Display Order<input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} className="mt-2 min-h-[40px] w-full rounded-md border border-[#E6E5EC] px-3 text-[14px] text-[#1B1726]" /></label>
              <div className="flex justify-end gap-2 border-t border-[#E6E5EC] pt-4 sm:col-span-2">
                <button type="button" onClick={() => setShowEditor(false)} className={BTN}>Cancel</button>
                <button disabled={saving} className={BTN}>{saving ? 'Saving…' : 'Save Testimonial'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Tag>
  );
}
