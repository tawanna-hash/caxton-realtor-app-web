'use client';

// app/admin/magazines/[id]/MagazineEditForm.tsx
//
// Edit form for an existing magazine.

import { useState } from 'react';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';

type Pub = 'austin' | 'san_antonio';

type Magazine = {
  id: number;
  publication: Pub;
  year: number;
  month: number;
  issue_label: string;
  cover_url: string | null;
  reader_url: string | null;
  page_urls: string[] | null;
  page_texts: string[] | null;
  page_count: number;
  sort_date: string;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function MagazineEditForm({ initial }: { initial: Magazine }) {
  const [publication, setPublication] = useState<Pub>(initial.publication);
  const [year, setYear] = useState<number>(initial.year);
  const [month, setMonth] = useState<number>(initial.month);
  const [issueLabel, setIssueLabel] = useState<string>(initial.issue_label);
  const [sortDate, setSortDate] = useState<string>(initial.sort_date?.slice(0, 10) ?? '');

  const [coverUrl, setCoverUrl] = useState<string | null>(initial.cover_url);
  const [readerUrl, setReaderUrl] = useState<string | null>(initial.reader_url);
  const [pageUrls, setPageUrls] = useState<string[]>(initial.page_urls ?? []);
  const [hasTexts, setHasTexts] = useState<boolean>(
    Array.isArray(initial.page_texts) && initial.page_texts.length > 0,
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "Saved" banner that auto-clears after 4s. We set visible=true
  // synchronously when a save lands, then schedule the clear via setTimeout
  // — no Date.now() in render, no setState-in-effect.
  const [savedVisible, setSavedVisible] = useState(false);
  function markSaved() {
    setSavedVisible(true);
    setTimeout(() => setSavedVisible(false), 4000);
  }

  const id = initial.id;

  async function patch(body: Record<string, unknown>) {
    const r = await fetch(`/api/admin/magazines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error || `patch failed (${r.status})`);
    }
    markSaved();
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('meta');
    try {
      await patch({
        publication,
        year,
        month,
        issue_label: issueLabel.trim(),
        sort_date: sortDate,
      });
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCoverChange(file: File) {
    setError(null);
    setBusy('cover');
    try {
      const blob = await upload(`magazine-covers/${id}/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/magazines/upload-token',
      });
      await patch({ cover_url: blob.url });
      setCoverUrl(blob.url);
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePdfChange(file: File) {
    setError(null);
    setBusy('pdf');
    try {
      const blob = await upload(`magazine-pdfs/${id}/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/magazines/upload-token',
          multipart: true,
      });
      await patch({ reader_url: blob.url });
      setReaderUrl(blob.url);
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleAddPages(files: File[]) {
    setError(null);
    setBusy('pages');
    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
    const newUrls: string[] = [...pageUrls];
    try {
      for (const f of sorted) {
        const blob = await upload(`magazine-pages/${id}/${f.name}`, f, {
          access: 'public',
          handleUploadUrl: '/api/admin/magazines/upload-token',
        });
        newUrls.push(blob.url);
      }
      await patch({ page_urls: newUrls, page_count: newUrls.length });
      setPageUrls(newUrls);
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRemovePage(idx: number) {
    if (!confirm('Remove this page from the list? The file remains in Blob.')) return;
    setError(null);
    setBusy('pages');
    const next = pageUrls.filter((_, i) => i !== idx);
    try {
      await patch({ page_urls: next, page_count: next.length });
      setPageUrls(next);
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleMovePage(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= pageUrls.length) return;
    const next = [...pageUrls];
    [next[idx], next[target]] = [next[target], next[idx]];
    setError(null);
    setBusy('pages');
    try {
      await patch({ page_urls: next });
      setPageUrls(next);
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleReExtract() {
    if (!readerUrl) {
      setError('No PDF on this issue — upload one first.');
      return;
    }
    setError(null);
    setBusy('extract');
    try {
      const r = await fetch('/api/admin/magazines/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: readerUrl }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `extract failed (${r.status})`);
      }
      const data = await r.json();
      await patch({ page_texts: data.pages });
      setHasTexts(true);
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin/magazines" className="text-sm text-blue-600 hover:underline">
            ← Back to magazines
          </Link>
          {savedVisible && <span className="text-xs text-green-600">Saved ✓</span>}
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-4">
          Edit: {initial.issue_label}
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}

        {/* Metadata */}
        <form onSubmit={handleSaveMeta} className="bg-white border border-gray-200 rounded-md p-6 space-y-4 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-gray-500 font-medium">Metadata</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Publication</label>
            <select
              value={publication}
              onChange={(e) => setPublication(e.target.value as Pub)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            >
              <option value="austin">RealtyLine (Austin)</option>
              <option value="san_antonio">Newsline (San Antonio)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2020, i, 1).toLocaleString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issue label</label>
            <input
              type="text"
              value={issueLabel}
              onChange={(e) => setIssueLabel(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort date</label>
            <input
              type="date"
              value={sortDate}
              onChange={(e) => setSortDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            />
          </div>
          <button
            type="submit"
            disabled={busy === 'meta'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {busy === 'meta' ? 'Saving…' : 'Save metadata'}
          </button>
        </form>

        {/* Cover */}
        <div className="bg-white border border-gray-200 rounded-md p-6 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">Cover image</h2>
          <div className="flex items-start gap-4">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="w-24 h-32 object-cover bg-gray-100 rounded" />
            ) : (
              <div className="w-24 h-32 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs">No cover</div>
            )}
            <div className="flex-1">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCoverChange(f);
                }}
                disabled={busy !== null}
                className="text-sm"
              />
              {busy === 'cover' && <p className="text-xs text-blue-600 mt-1">Uploading…</p>}
            </div>
          </div>
        </div>

        {/* PDF */}
        <div className="bg-white border border-gray-200 rounded-md p-6 mb-6">
          <h2 className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">PDF (enables search)</h2>
          {readerUrl ? (
            <p className="text-xs text-gray-500 mb-2 break-all">{readerUrl}</p>
          ) : (
            <p className="text-xs text-gray-400 mb-2">No PDF uploaded.</p>
          )}
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfChange(f);
            }}
            disabled={busy !== null}
            className="text-sm"
          />
          {busy === 'pdf' && <p className="text-xs text-blue-600 mt-1">Uploading…</p>}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={handleReExtract}
              disabled={busy !== null || !readerUrl}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded disabled:opacity-50"
            >
              {busy === 'extract' ? 'Extracting…' : hasTexts ? 'Re-extract page text' : 'Extract page text from PDF'}
            </button>
            {hasTexts && <span className="text-xs text-green-600 ml-2">Search enabled ✓</span>}
          </div>
        </div>

        {/* Pages */}
        <div className="bg-white border border-gray-200 rounded-md p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wider text-gray-500 font-medium">
              Pages ({pageUrls.length})
            </h2>
            <label className="cursor-pointer text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md">
              + Add pages
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleAddPages(Array.from(e.target.files));
                  }
                }}
                disabled={busy !== null}
                className="hidden"
              />
            </label>
          </div>
          {busy === 'pages' && <p className="text-xs text-blue-600 mb-2">Working…</p>}
          {pageUrls.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No pages uploaded yet.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {pageUrls.map((url, idx) => (
                <li key={url + idx} className="border border-gray-200 rounded p-2 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-32 object-cover bg-gray-100 rounded mb-1" />
                  <p className="text-gray-500">Page {idx + 1}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleMovePage(idx, -1)}
                        disabled={idx === 0 || busy !== null}
                        className="px-1.5 py-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMovePage(idx, 1)}
                        disabled={idx === pageUrls.length - 1 || busy !== null}
                        className="px-1.5 py-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      onClick={() => handleRemovePage(idx)}
                      disabled={busy !== null}
                      className="text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
