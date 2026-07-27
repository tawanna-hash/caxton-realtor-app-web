'use client';

// Admin event images manager.
// Create folders (issue month + event title), bulk upload images,
// inline edit all fields, single/bulk/folder delete.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, Plus, ExternalLink, Upload, FolderOpen, Image as ImageIcon, ChevronDown, Folder, CheckSquare, Square, X } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';
import MonthPicker from './MonthPicker';

const PUBLICATIONS = [
  { id: 'realtyline', label: 'RealtyLine Austin' },
  { id: 'newsline', label: 'Newsline San Antonio' },
] as const;

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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AdminEventImagesPage() {
  const [photos, setPhotos] = useState<EventPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // New folder form — default to current month
  const currentMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [newFolderMonth, setNewFolderMonth] = useState(currentMonth);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [newFolderPub, setNewFolderPub] = useState<string>('realtyline');

  // Bulk upload state
  const [bulkDate, setBulkDate] = useState(currentMonth);
  const [bulkTitle, setBulkTitle] = useState('');
  const [bulkPub, setBulkPub] = useState<string>('realtyline');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ uploaded: number; failed: number; total: number } | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Folder state
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());

  // Inline editing
  const [editingTitle, setEditingTitle] = useState<number | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [editingDesc, setEditingDesc] = useState<number | null>(null);
  const [editDescValue, setEditDescValue] = useState('');
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [editMonthValue, setEditMonthValue] = useState('');

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Parse YYYY-MM from an eventDate string WITHOUT timezone conversion.
  // Neon returns DATE columns as ISO strings like "2026-07-01T00:00:00.000Z".
  // Using new Date() applies local timezone, causing off-by-one errors (UTC midnight → June 30 in CDT).
  // Instead, extract the date portion directly from the string.
  function parseMonthKey(eventDate: string): string {
    // Get just the YYYY-MM-DD part, then take YYYY-MM
    const datePart = eventDate.slice(0, 10); // "2026-07-01" or "2026-07"
    return datePart.slice(0, 7);             // "2026-07"
  }

  // Group photos by issue month
  const monthGroups: { key: string; label: string; photos: EventPhoto[] }[] = (() => {
    if (!photos) return [];
    const map = new Map<string, EventPhoto[]>();
    for (const p of photos) {
      const key = parseMonthKey(p.eventDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => {
        const [y, m] = key.split('-').map(Number);
        return { key, label: `${MONTHS[m - 1]} ${y}`, photos: items };
      });
  })();

  // Compress image client-side: max 2400px, JPEG 0.92
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) { resolve(file); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 2400;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width >= height) { height = Math.round((height / width) * MAX_DIM); width = MAX_DIM; }
            else { width = Math.round((width / height) * MAX_DIM); height = MAX_DIM; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(file); return; }
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.92);
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

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

  // --- Create new folder (sets up bulk upload context) ---
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderMonth) { setError('Pick an issue month for the new folder.'); return; }
    // Pre-fill bulk upload fields and open bulk section
    setBulkDate(newFolderMonth);
    setBulkTitle(newFolderTitle);
    setBulkPub(newFolderPub);
    setShowBulk(true);
    setNewFolderTitle('');
    // Clear selection
    setSelectedPhotos(new Set());
    // Scroll to bulk upload
    setTimeout(() => {
      document.getElementById('bulk-upload-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // --- Bulk upload ---
  const handleBulkUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!bulkDate) { setError('Pick an issue month before uploading.'); return; }
    const files = Array.from(fileList);
    setBulkUploading(true);
    setBulkProgress({ uploaded: 0, failed: 0, total: files.length });
    setError(null);

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    let uploaded = 0, failed = 0;

    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          failed++;
          setBulkProgress({ uploaded, failed, total: files.length });
          if (uploaded === 0 && failed === 1)
            setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is 10MB.`);
          continue;
        }
        try {
          const compressed = await compressImage(file);
          const formData = new FormData();
          formData.append('files', compressed);
          if (bulkDate) formData.append('eventDate', bulkDate);
          if (bulkTitle) formData.append('title', bulkTitle);
          if (bulkPub) formData.append('publication', bulkPub);
          const res = await fetch('/api/admin/event-images/upload', { method: 'POST', body: formData });
          if (!res.ok) {
            console.error(`Upload failed for ${file.name}:`, await res.text().catch(() => ''));
            failed++;
          } else {
            const data = await res.json().catch(() => ({}));
            if (data.uploaded === 0 && data.failed > 0) {
              console.error(`DB record failed for ${file.name}:`, data.results?.[0]?.error);
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
      if (failed > 0 && uploaded === 0) setError(`All ${failed} image(s) failed to upload.`);
      else if (failed > 0) setError(`${failed} of ${files.length} image(s) failed to upload.`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
      setBulkUploading(false);
      setTimeout(() => { load(); }, 300);
    }
  };

  // --- Single delete ---
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this photo?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/event-images?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      setSelectedPhotos((prev) => { const n = new Set(prev); n.delete(id); return n; });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  // --- Bulk delete selected ---
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedPhotos);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected photo(s)?`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`/api/admin/event-images?ids=${ids.join(',')}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      setSelectedPhotos(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setBulkDeleting(false);
    }
  };

  // --- Delete entire folder ---
  const handleDeleteFolder = async (monthKey: string, label: string) => {
    if (!confirm(`Delete the entire "${label}" folder and ALL its photos? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`/api/admin/event-images?month=${monthKey}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete folder (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete folder');
    } finally {
      setBulkDeleting(false);
    }
  };

  // --- Inline editing ---
  const saveTitle = async (id: number) => {
    const v = editTitleValue.trim();
    if (!v) { setEditingTitle(null); return; }
    try {
      const res = await fetch('/api/admin/event-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: v }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setPhotos((prev) => prev?.map((p) => p.id === id ? { ...p, title: v } : p) ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setEditingTitle(null); }
  };

  const saveDesc = async (id: number) => {
    const v = editDescValue.trim();
    try {
      const res = await fetch('/api/admin/event-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, description: v || null }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setPhotos((prev) => prev?.map((p) => p.id === id ? { ...p, description: v || null } : p) ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setEditingDesc(null); }
  };

  const saveMonth = async (id: number) => {
    const v = editMonthValue;
    if (!v) { setEditingMonth(null); return; }
    try {
      const res = await fetch('/api/admin/event-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, eventDate: v }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await load();
      setEditingMonth(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setEditingMonth(null); }
  };

  // Batch rename all in folder
  const saveFolderTitle = async (group: { photos: EventPhoto[] }, newTitle: string) => {
    const v = newTitle.trim();
    if (!v) return;
    setBulkUploading(true);
    try {
      for (const p of group.photos) {
        await fetch('/api/admin/event-images', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id, title: v }),
        });
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBulkUploading(false); }
  };

  // --- Selection helpers ---
  const toggleSelect = (id: number) => {
    setSelectedPhotos((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAllInFolder = (photoIds: number[]) => {
    setSelectedPhotos((prev) => {
      const n = new Set(prev);
      const allSelected = photoIds.every((id) => n.has(id));
      if (allSelected) photoIds.forEach((id) => n.delete(id));
      else photoIds.forEach((id) => n.add(id));
      return n;
    });
  };
  const clearSelection = () => setSelectedPhotos(new Set());

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">Admin</p>
          <PageTitle size="md">Event Images</PageTitle>
          <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
            Upload and manage event photographs. Images appear on the public{' '}
            <a href="/event-images" className="text-brand-700 underline" target="_blank" rel="noopener">/event-images</a> page.
          </p>
        </div>
        <a href="/event-images" target="_blank" rel="noopener"
          className="shrink-0 border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors whitespace-nowrap self-start flex items-center gap-2">
          View page <ExternalLink size={14} />
        </a>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      {/* Selection bar */}
      {selectedPhotos.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-md px-4 py-3">
          <span className="text-sm font-medium text-brand-900">{selectedPhotos.size} selected</span>
          <button onClick={handleBulkDelete} disabled={bulkDeleting}
            className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 text-xs font-medium rounded-md hover:bg-red-700 disabled:opacity-40">
            <Trash2 size={14} /> Delete Selected
          </button>
          <button onClick={clearSelection} className="text-xs text-gray-600 hover:text-gray-900">Clear</button>
        </div>
      )}

      {/* Create New Folder */}
      <form onSubmit={handleCreateFolder} className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Folder size={18} className="text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Create New Folder</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issue Month *</label>
            <MonthPicker value={newFolderMonth} onChange={setNewFolderMonth} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
            <input type="text" value={newFolderTitle} onChange={(e) => setNewFolderTitle(e.target.value)} required
              placeholder="e.g., ABREP Monthly Luncheon"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Publication</label>
            <select value={newFolderPub} onChange={(e) => setNewFolderPub(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {PUBLICATIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button type="submit"
            className="inline-flex items-center gap-2 bg-brand-700 text-white px-5 py-2 text-sm font-medium hover:bg-brand-800 rounded-md transition-colors">
            <Plus size={16} /> Create Folder &amp; Upload
          </button>
          <p className="mt-2 text-xs text-gray-400">Creates a folder for the selected month and scrolls to the upload section.</p>
        </div>
      </form>

      {/* Bulk upload */}
      <div id="bulk-upload-section" className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <button onClick={() => setShowBulk(!showBulk)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
          <Upload size={16} /> {showBulk ? 'Hide Bulk Upload' : 'Bulk Upload'}
        </button>

        {showBulk && (
          <div className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue Month *</label>
                <MonthPicker value={bulkDate} onChange={setBulkDate} className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Title <span className="text-gray-400">(optional — filenames used if blank)</span>
                </label>
                <input type="text" value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)}
                  placeholder="e.g., ABREP Monthly Luncheon"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Publication</label>
                <select value={bulkPub} onChange={(e) => setBulkPub(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  {PUBLICATIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => fileInputRef.current?.click()} disabled={bulkUploading}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors disabled:opacity-60">
                <ImageIcon size={16} /> Select Images
              </button>
              <button onClick={() => folderInputRef.current?.click()} disabled={bulkUploading}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors disabled:opacity-60">
                <FolderOpen size={16} /> Select Folder
              </button>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => handleBulkUpload(e.target.files)} />
            <input ref={folderInputRef} type="file" // @ts-expect-error — webkitdirectory is non-standard
              webkitdirectory="" directory="" multiple className="hidden"
              onChange={(e) => handleBulkUpload(e.target.files)} />

            {bulkUploading && (
              <div className="mt-4 flex items-center gap-3 text-sm text-gray-600">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-700 rounded-full" />
                Uploading {bulkProgress?.uploaded ?? 0}/{bulkProgress?.total ?? 0}...
              </div>
            )}
            {bulkProgress && !bulkUploading && (
              <div className={`mt-4 rounded-md px-4 py-2 text-sm ${
                bulkProgress.failed > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                Uploaded {bulkProgress.uploaded} of {bulkProgress.total} images
                {bulkProgress.failed > 0 && ` (${bulkProgress.failed} failed)`}
              </div>
            )}

            <p className="mt-3 text-xs text-gray-400">
              Images are compressed (max 2400px, JPEG 92% quality) then uploaded. Max 10MB per image before compression.
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
          <p className="text-sm text-gray-500">No photos yet. Create a folder above to get started.</p>
        ) : (
          <div className="space-y-3">
            {monthGroups.map((group) => {
              const expanded = expandedMonths[group.key] ?? true;
              const folderPhotoIds = group.photos.map((p) => p.id);
              const allSelected = folderPhotoIds.every((id) => selectedPhotos.has(id));
              const someSelected = folderPhotoIds.some((id) => selectedPhotos.has(id));
              return (
                <div key={group.key} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Folder header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
                    <button onClick={() => toggleMonth(group.key)}
                      className="flex items-center gap-3 text-left flex-1">
                      <Folder size={18} className="text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{group.label}</span>
                      <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                        {group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}
                      </span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {/* Select all in folder */}
                    <button onClick={() => toggleSelectAllInFolder(folderPhotoIds)}
                      className="text-gray-400 hover:text-brand-600 p-1" title={allSelected ? 'Deselect all' : 'Select all'}>
                      {allSelected ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} />}
                    </button>
                    {/* Delete folder */}
                    <button onClick={() => handleDeleteFolder(group.key, group.label)} disabled={bulkDeleting}
                      className="text-red-400 hover:text-red-600 p-1 disabled:opacity-40" title="Delete entire folder">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {expanded && (
                    <>
                      {/* Batch rename */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-white">
                        <input type="text" defaultValue={group.photos[0]?.title ?? ''}
                          placeholder="Rename all photos in this folder..."
                          className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          onKeyDown={(e) => { if (e.key === 'Enter') saveFolderTitle(group, (e.target as HTMLInputElement).value); }} />
                        <button onClick={(e) => saveFolderTitle(group, (e.currentTarget.previousSibling as HTMLInputElement).value)}
                          disabled={bulkUploading}
                          className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-md hover:bg-brand-700 disabled:opacity-40">
                          Update All
                        </button>
                      </div>
                      {/* Photo grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3">
                        {group.photos.map((p) => {
                          const photoMonth = parseMonthKey(p.eventDate);
                          const isSelected = selectedPhotos.has(p.id);
                          return (
                            <div key={p.id} className={`group relative rounded-lg overflow-hidden border-2 bg-gray-50 transition-colors ${
                              isSelected ? 'border-brand-500' : 'border-gray-200'
                            }`}>
                              {/* Checkbox */}
                              <button onClick={() => toggleSelect(p.id)}
                                className="absolute top-2 left-2 z-10 bg-white/90 rounded p-1 shadow-sm hover:bg-white">
                                {isSelected
                                  ? <CheckSquare size={16} className="text-brand-600" />
                                  : <Square size={16} className="text-gray-400" />}
                              </button>
                              <div className="aspect-square relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.thumbnailUrl || p.imageUrl} alt={p.title} className="object-cover w-full h-full" />
                              </div>
                              <div className="p-2 space-y-1">
                                {/* Title */}
                                {editingTitle === p.id ? (
                                  <input autoFocus type="text" value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    onBlur={() => saveTitle(p.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(p.id); if (e.key === 'Escape') setEditingTitle(null); }}
                                    className="w-full text-xs border border-brand-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                                ) : (
                                  <button onClick={() => { setEditingTitle(p.id); setEditTitleValue(p.title); }}
                                    className="text-xs font-medium text-gray-900 truncate block w-full text-left hover:text-brand-600"
                                    title="Click to edit title">
                                    {p.title}
                                  </button>
                                )}
                                {/* Issue Month */}
                                {editingMonth === p.id ? (
                                  <div className="flex gap-1">
                                    <MonthPicker value={editMonthValue || photoMonth} onChange={setEditMonthValue} />
                                    <button onClick={() => saveMonth(p.id)}
                                      className="text-xs bg-brand-600 text-white px-2 rounded hover:bg-brand-700">OK</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setEditingMonth(p.id); setEditMonthValue(photoMonth); }}
                                    className="text-xs text-gray-500 hover:text-brand-600 block w-full text-left"
                                    title="Click to change issue month">
                                    {group.label}
                                  </button>
                                )}
                                {/* Description */}
                                {editingDesc === p.id ? (
                                  <textarea autoFocus value={editDescValue}
                                    onChange={(e) => setEditDescValue(e.target.value)}
                                    onBlur={() => saveDesc(p.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDesc(p.id); } if (e.key === 'Escape') setEditingDesc(null); }}
                                    rows={2} placeholder="Add description..."
                                    className="w-full text-xs border border-brand-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
                                ) : (
                                  <button onClick={() => { setEditingDesc(p.id); setEditDescValue(p.description ?? ''); }}
                                    className="text-xs text-gray-400 hover:text-brand-600 block w-full text-left truncate"
                                    title="Click to edit description">
                                    {p.description || 'Add description...'}
                                  </button>
                                )}
                                {/* Publication */}
                                <select value={p.publication}
                                  onChange={(e) => {
                                    fetch('/api/admin/event-images', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: p.id, publication: e.target.value }),
                                    }).then(() => load()).catch(() => {});
                                  }}
                                  className="w-full text-xs border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500">
                                  {PUBLICATIONS.map((pub) => <option key={pub.id} value={pub.id}>{pub.label}</option>)}
                                </select>
                              </div>
                              {/* Delete */}
                              <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                                className="absolute top-2 right-2 bg-white/90 hover:bg-white text-red-600 p-1.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                                title="Delete">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
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
