'use client';

// Admin event images manager.
// Add photos (title, date, image URL), view existing, delete.

import { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, ExternalLink } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';

type EventPhoto = {
  id: number;
  title: string;
  eventDate: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  publication: string;
  uploadedBy: string | null;
  createdAt: string;
};

export default function AdminEventImagesPage() {
  const [photos, setPhotos] = useState<EventPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/event-images', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setPhotos(data.photos ?? []);
      setError(null);
    } catch (e) {
      setPhotos([]);
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !eventDate || !imageUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/event-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, eventDate, imageUrl,
          thumbnailUrl: thumbnailUrl || null,
          description: description || null,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to add (${res.status}) ${txt}`);
      }
      setTitle('');
      setEventDate('');
      setImageUrl('');
      setThumbnailUrl('');
      setDescription('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this photo?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/event-images?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      setPhotos((prev) => (prev ?? []).filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">Admin</p>
          <PageTitle size="md">Event Images</PageTitle>
          <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
            Upload and manage event photographs. Images appear on the public{' '}
            <a href="/event-images" className="text-brand-700 underline" target="_blank" rel="noopener">
              /event-images
            </a>{' '}
            page.
          </p>
        </div>
        <a
          href="/event-images"
          target="_blank"
          rel="noopener"
          className="shrink-0 border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors whitespace-nowrap self-start flex items-center gap-2"
        >
          View page <ExternalLink size={14} />
        </a>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g., Grand Opening - La Cima"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Image URL *</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              required
              placeholder="https://..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Thumbnail URL <span className="text-gray-400">(optional — defaults to image URL)</span>
            </label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief caption or description..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-brand-700 text-white px-5 py-2 text-sm font-medium hover:bg-brand-800 rounded-md transition-colors disabled:opacity-60"
          >
            <Plus size={16} />
            {submitting ? 'Adding...' : 'Add Photo'}
          </button>
        </div>
      </form>

      {/* Existing photos */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Existing Photos ({photos?.length ?? 0})
        </h2>
        {photos === null ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-gray-500">No photos yet. Add one above.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <div className="aspect-square relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumbnailUrl || p.imageUrl}
                    alt={p.title}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-900 truncate">{p.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(p.eventDate + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={deleting === p.id}
                  className="absolute top-2 right-2 bg-white/90 hover:bg-white text-red-600 p-1.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
