'use client';

// Admin event images manager.
// Add photos (title, date, image URL), view existing, delete.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, Plus, ExternalLink, Upload, FolderOpen, Image as ImageIcon, ChevronDown, Folder } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';
import MonthPicker from './MonthPicker';

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

  // Bulk upload state
  const [bulkDate, setBulkDate] = useState('');
  const [bulkTitle, setBulkTitle] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ uploaded: number; failed: number; total: number } | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Group photos by issue month
  const monthGroups: { key: string; label: string; photos: EventPhoto[] }[] = (() => {
    if (!photos) return [];
    const map = new Map<string, EventPhoto[]>();
    for (const p of photos) {
      const d = new Date(p.eventDate + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => {
        const [y, m] = key.split('-').map(Number);
        return { key, label: `${MONTHS[m - 1]} ${y}`, photos: items };
      });
  })();

  // Compress an image file client-side using Canvas.
  // Resizes to max 2400px on the longest edge, JPEG at 0.92 quality.
  // This keeps photos sharp while reducing file size well under Vercel's limit.
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        resolve(file); // pass through non-images
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 2400;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width >= height) {
              height = Math.round((height / width) * MAX_DIM);
              width = MAX_DIM;
            } else {
              width = Math.round((width / height) * MAX_DIM);
              height = MAX_DIM;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(file); return; }
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) { resolve(file); return; }
              const compressed = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, '.jpg'),
                { type: 'image/jpeg' },
              );
              resolve(compressed);
            },
            'image/jpeg',
            0.92,
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

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
          title, eventDate: eventDate.length === 7 ? eventDate + '-01' : eventDate, imageUrl,
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
      // Force refresh from server so the list is always in sync
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBulkUploading(true);
    setBulkProgress({ uploaded: 0, failed: 0, total: files.length });
    setError(null);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    let uploaded = 0;
    let failed = 0;

    try {
      for (const file of files) {
        // Client-side size check (before compression)
        if (file.size > MAX_FILE_SIZE) {
          failed++;
          setBulkProgress({ uploaded, failed, total: files.length });
          if (uploaded === 0 && failed === 1) {
            setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is 10MB.`);
          }
          continue;
        }

        try {
          // 1. Compress the image client-side
          const compressed = await compressImage(file);

          // 2. Upload to Vercel Blob via server route (one file at a time)
          const formData = new FormData();
          formData.append('files', compressed);
          if (bulkDate) formData.append('eventDate', bulkDate);
          if (bulkTitle) formData.append('title', bulkTitle);

          const res = await fetch('/api/admin/event-images/upload', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            console.error(`Upload failed for ${file.name}:`, txt);
            failed++;
          } else {
            const data = await res.json().catch(() => ({}));
            if (data.uploaded === 0 && data.failed > 0) {
              const errMsg = data.results?.[0]?.error || 'DB record creation failed';
              console.error(`DB record failed for ${file.name}:`, errMsg);
              failed++;
            } else {
              uploaded++;
            }
          }
          setBulkProgress({ uploaded, failed, total: files.length });
        } catch (e) {
          console.error(`Upload error for ${file.name}:`, e);
          failed++;
          setBulkProgress({ uploaded, failed, total: files.length });
        }
      }

      if (failed > 0 && uploaded === 0) {
        setError(`All ${failed} image(s) failed to upload.`);
      } else if (failed > 0) {
        setError(`${failed} of ${files.length} image(s) failed to upload.`);
      }
    } finally {
      // Always reset inputs and refresh the list, even if something went wrong
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
      setBulkUploading(false);
      // Small delay to let DB writes commit before re-fetching
      setTimeout(() => { load(); }, 300);
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Issue Month *</label>
            <MonthPicker
              value={eventDate}
              onChange={setEventDate}
              className="w-full"
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

      {/* Bulk upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <button
          onClick={() => setShowBulk(!showBulk)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Upload size={16} />
          {showBulk ? 'Hide Bulk Upload' : 'Bulk Upload'}
        </button>

        {showBulk && (
          <div className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Issue Month <span className="text-gray-400">(defaults to current month)</span>
                </label>
                <MonthPicker
                  value={bulkDate}
                  onChange={setBulkDate}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Title <span className="text-gray-400">(optional — filenames used if blank)</span>
                </label>
                <input
                  type="text"
                  value={bulkTitle}
                  onChange={(e) => setBulkTitle(e.target.value)}
                  placeholder="e.g., KW Austin Charity Event"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={bulkUploading}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors disabled:opacity-60"
              >
                <ImageIcon size={16} />
                Select Images
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={bulkUploading}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors disabled:opacity-60"
              >
                <FolderOpen size={16} />
                Select Folder
              </button>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleBulkUpload(e.target.files)}
            />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error — webkitdirectory is a non-standard attribute
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => handleBulkUpload(e.target.files)}
            />

            {/* Progress */}
            {bulkUploading && (
              <div className="mt-4 flex items-center gap-3 text-sm text-gray-600">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-700 rounded-full" />
                Uploading {bulkProgress?.uploaded ?? 0}/{bulkProgress?.total ?? 0}...
              </div>
            )}
            {bulkProgress && !bulkUploading && (
              <div className={`mt-4 rounded-md px-4 py-2 text-sm ${
                bulkProgress.failed > 0
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                Uploaded {bulkProgress.uploaded} of {bulkProgress.total} images
                {bulkProgress.failed > 0 && ` (${bulkProgress.failed} failed)`}
              </div>
            )}

            <p className="mt-3 text-xs text-gray-400">
              Images are compressed (max 2400px, JPEG 92% quality) then uploaded to Vercel Blob.
              Max 10MB per image before compression. Each file becomes a separate photo entry.
            </p>
          </div>
        )}
      </div>

      {/* Existing photos — grouped by month */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Existing Photos ({photos?.length ?? 0})
        </h2>
        {photos === null ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-gray-500">No photos yet. Add one above.</p>
        ) : (
          <div className="space-y-3">
            {monthGroups.map((group) => {
              const expanded = expandedMonths[group.key] ?? true; // default expanded
              return (
                <div key={group.key} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleMonth(group.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <Folder size={18} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{group.label}</span>
                    <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                      {group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-gray-400 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expanded && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3">
                      {group.photos.map((p) => (
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
