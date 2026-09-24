'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ArticleAuthor } from '@/lib/server/article-authors';

const fieldStyle = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/30';

export function AuthorPhoto({ name, src }: { name: string; src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
      {src && failedSrc !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : initials}
    </span>
  );
}

export default function AuthorPicker({
  name, avatar, onChange, seedAuthors = [],
}: {
  name: string;
  avatar: string;
  onChange: (author: ArticleAuthor) => void;
  seedAuthors?: ArticleAuthor[];
}) {
  const [authors, setAuthors] = useState<ArticleAuthor[]>(seedAuthors);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newAvatar, setNewAvatar] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editedAvatar, setEditedAvatar] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/admin/article-authors', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load authors (${res.status})`);
        return res.json() as Promise<{ authors: ArticleAuthor[] }>;
      })
      .then(({ authors: found }) => {
        if (active) {
          setAuthors((previous) => {
            const map = new Map(previous.map((a) => [a.name.toLowerCase(), a]));
            for (const author of found) map.set(author.name.toLowerCase(), author);
            return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load authors'); });
    return () => { active = false; };
  }, []);

  const results = useMemo(
    () => authors.filter((author) => author.name.toLowerCase().includes(search.toLowerCase().trim())),
    [authors, search],
  );

  async function upload(file: File, target: 'new' | 'edit' = 'new') {
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setError('Select an image smaller than 8 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('kind', 'author');
      const res = await fetch('/api/admin/articles/upload-image', { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed');
      if (target === 'edit') setEditedAvatar(json.url);
      else setNewAvatar(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function savePhoto() {
    if (!editedAvatar.trim()) { setError('Upload a photo or paste its URL.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/article-authors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName, avatar: editedAvatar.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not save photo (${res.status})`);
      const updated = data.author as ArticleAuthor;
      setAuthors((current) => current.map((author) => author.name.toLowerCase() === updated.name.toLowerCase() ? updated : author));
      if (name.toLowerCase() === updated.name.toLowerCase()) onChange(updated);
      setEditingName('');
      setEditedAvatar('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save photo');
    } finally {
      setSaving(false);
    }
  }

  async function create() {
    if (!newName.trim()) { setError('Enter an author name.'); return; }
    if (authors.some((author) => author.name.trim().toLowerCase() === newName.trim().toLowerCase())) {
      setError('This author is already listed. Select the existing profile instead.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/article-authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, avatar: newAvatar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not save author (${res.status})`);
      const author = data.author as ArticleAuthor;
      setAuthors((current) => [...current, author].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(author);
      setOpen(false);
      setCreating(false);
      setNewName('');
      setNewAvatar('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save author');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(!open); setError(''); }}
        aria-expanded={open} aria-haspopup="listbox"
        className={`${fieldStyle} flex min-h-11 items-center justify-between gap-3 text-left`}>
        <span className="flex min-w-0 items-center gap-2">
          <AuthorPhoto name={name} src={avatar} />
          <span className="truncate">{name || 'Select an author'}</span>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="relative z-20 mt-2 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          {editingName ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Photo for {editingName}</p>
              <label className="block text-xs font-medium text-gray-700">Upload replacement photo
                <input type="file" accept="image/*" disabled={uploading || saving}
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, 'edit'); }}
                  className="mt-1 block w-full text-xs text-gray-600" />
              </label>
              <div className="flex items-center gap-2">
                <AuthorPhoto name={editingName} src={editedAvatar} />
                <input type="url" value={editedAvatar} onChange={(e) => setEditedAvatar(e.target.value)}
                  placeholder="Or paste an image URL" aria-label="Replacement author photo URL" className={fieldStyle} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void savePhoto()} disabled={saving || uploading}
                  className="rounded-md bg-brand-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save photo'}
                </button>
                <button type="button" onClick={() => { setEditingName(''); setError(''); }} className="px-3 py-2 text-xs text-gray-600">Back to authors</button>
              </div>
            </div>
          ) : creating ? (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-700">New author name
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className={`${fieldStyle} mt-1`} />
              </label>
              <label className="block text-xs font-medium text-gray-700">Author photo
                <input type="file" accept="image/*" disabled={uploading || saving} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }}
                  className="mt-1 block w-full text-xs text-gray-600" />
              </label>
              {newAvatar && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={newAvatar} alt="New author photo" className="h-10 w-10 rounded-full object-cover" />
                  <span className="text-xs text-gray-600">Photo uploaded</span>
                </div>
              )}
              <input type="url" value={newAvatar} onChange={(e) => setNewAvatar(e.target.value)} placeholder="Or paste an image URL" aria-label="Author photo URL" className={fieldStyle} />
              <div className="flex gap-2">
                <button type="button" onClick={() => void create()} disabled={saving || uploading}
                  className="rounded-md bg-brand-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save author'}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 text-xs text-gray-600">Back to authors</button>
              </div>
            </div>
          ) : (
            <>
              <input autoFocus type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search authors" aria-label="Search authors" className={fieldStyle} />
              <ul role="listbox" aria-label="Authors" className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                {results.map((author) => (
                  <li key={author.name} role="option" aria-selected={name.toLowerCase() === author.name.toLowerCase()}>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { onChange(author); setOpen(false); }}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 focus-visible:bg-gray-100">
                        <AuthorPhoto name={author.name} src={author.avatar} />
                        <span className="truncate">{author.name}</span>
                      </button>
                      <button type="button" aria-label={`Edit photo for ${author.name}`}
                        onClick={() => { setEditingName(author.name); setEditedAvatar(author.avatar || ''); setError(''); }}
                        className="shrink-0 rounded-md px-2 py-1.5 text-xs text-brand-700 hover:bg-gray-100 focus-visible:bg-gray-100">
                        Edit photo
                      </button>
                    </div>
                  </li>
                ))}
                {results.length === 0 && <li className="px-2 py-2 text-xs text-gray-500">No matching authors</li>}
              </ul>
              <button type="button" onClick={() => { setNewName(search); setCreating(true); }}
                className="mt-2 w-full border-t border-gray-200 px-2 pt-3 text-left text-sm font-medium text-brand-700">
                + Create new author
              </button>
            </>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
