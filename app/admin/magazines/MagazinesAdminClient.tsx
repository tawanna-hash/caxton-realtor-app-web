'use client';

// app/admin/magazines/MagazinesAdminClient.tsx
//
// Two-column list of magazines (austin + san_antonio), newest first.
// Each card shows the cover, issue label, page count, edit/hotspots/
// delete actions, and three GIF-preview buttons (Full / Teaser /
// Ping-pong) that POST to /api/admin/magazines/[id]/gif?variant=... and
// expose a shareable URL with a copy button.
//
// Header links: + New Issue, Settings (publication-wide GA Measurement
// IDs).

import { useState } from 'react';
import Link from 'next/link';

type GifVariant = 'full' | 'teaser' | 'pingpong';

type Magazine = {
  id: number;
  publication: 'austin' | 'san_antonio';
  year: number;
  month: number;
  issue_label: string;
  cover_url: string | null;
  reader_url: string | null;
  page_urls: string[] | null;
  page_count: number;
  sort_date: string;
  gif_full_url: string | null;
  gif_teaser_url: string | null;
  gif_pingpong_url: string | null;
};

type Props = {
  initialMagazines: Magazine[];
};

const PUB_LABEL: Record<'austin' | 'san_antonio', string> = {
  austin: 'RealtyLine Austin',
  san_antonio: 'Newsline San Antonio',
};

const VARIANT_LABEL: Record<GifVariant, string> = {
  full: 'Full',
  teaser: 'Teaser',
  pingpong: 'Ping-pong',
};

function gifUrlFor(m: Magazine, variant: GifVariant): string | null {
  if (variant === 'full') return m.gif_full_url;
  if (variant === 'teaser') return m.gif_teaser_url;
  return m.gif_pingpong_url;
}

function applyGifUrl(m: Magazine, variant: GifVariant, url: string): Magazine {
  if (variant === 'full') return { ...m, gif_full_url: url };
  if (variant === 'teaser') return { ...m, gif_teaser_url: url };
  return { ...m, gif_pingpong_url: url };
}

export default function MagazinesAdminClient({ initialMagazines }: Props) {
  const [magazines, setMagazines] = useState<Magazine[]>(initialMagazines);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-(magazine,variant) UI state for the GIF buttons.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<Record<string, string>>({});

  const austin = magazines.filter((m) => m.publication === 'austin');
  const sa = magazines.filter((m) => m.publication === 'san_antonio');

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Delete "${label}"? This removes the row from the database. Uploaded files remain in Vercel Blob.`)) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const r = await fetch(`/api/admin/magazines/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${r.status})`);
      }
      setMagazines((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      setError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleGenerateGif(magazine: Magazine, variant: GifVariant, force: boolean) {
    const key = `${magazine.id}:${variant}`;
    setBusyKey(key);
    setVariantError((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const qs = new URLSearchParams({ variant });
      if (force) qs.set('force', '1');
      const r = await fetch(`/api/admin/magazines/${magazine.id}/gif?${qs.toString()}`, {
        method: 'POST',
      });
      const body = (await r.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        detail?: string;
      };
      if (!r.ok || !body.url) {
        const parts = [body.error, body.detail].filter(Boolean) as string[];
        const msg = parts.length > 0 ? parts.join(' — ') : `Generation failed (${r.status})`;
        throw new Error(msg);
      }
      setMagazines((prev) => prev.map((m) => (m.id === magazine.id ? applyGifUrl(m, variant, body.url as string) : m)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setVariantError((prev) => ({ ...prev, [key]: msg }));
    } finally {
      setBusyKey((curr) => (curr === key ? null : curr));
    }
  }

  async function handleCopy(magazineId: number, variant: GifVariant, url: string) {
    const key = `${magazineId}:${variant}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1500);
    } catch (err) {
      console.error('[MagazinesAdminClient] Clipboard write failed:', err);
    }
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Magazines</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/magazines/settings"
              className="text-sm text-gray-700 hover:text-gray-900 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Settings
            </Link>
            <Link
              href="/admin/magazines/new"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-sm"
            >
              + New Issue
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Column
            label={PUB_LABEL.austin}
            magazines={austin}
            deletingId={deletingId}
            onDelete={handleDelete}
            busyKey={busyKey}
            copiedKey={copiedKey}
            variantError={variantError}
            onGenerateGif={handleGenerateGif}
            onCopy={handleCopy}
          />
          <Column
            label={PUB_LABEL.san_antonio}
            magazines={sa}
            deletingId={deletingId}
            onDelete={handleDelete}
            busyKey={busyKey}
            copiedKey={copiedKey}
            variantError={variantError}
            onGenerateGif={handleGenerateGif}
            onCopy={handleCopy}
          />
        </div>
      </div>
    </div>
  );
}

function Column({
  label,
  magazines,
  deletingId,
  onDelete,
  busyKey,
  copiedKey,
  variantError,
  onGenerateGif,
  onCopy,
}: {
  label: string;
  magazines: Magazine[];
  deletingId: number | null;
  onDelete: (id: number, label: string) => void;
  busyKey: string | null;
  copiedKey: string | null;
  variantError: Record<string, string>;
  onGenerateGif: (magazine: Magazine, variant: GifVariant, force: boolean) => void;
  onCopy: (magazineId: number, variant: GifVariant, url: string) => void;
}) {
  return (
    <div>
      <h2 className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">{label}</h2>
      {magazines.length === 0 ? (
        <p className="text-gray-400 text-sm italic">No issues yet.</p>
      ) : (
        <ul className="space-y-3">
          {magazines.map((m) => (
            <li
              key={m.id}
              className="bg-white border border-gray-200 rounded-md p-3 flex items-start gap-3"
            >
              {m.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.cover_url} alt="" className="w-32 h-40 object-cover bg-gray-100 rounded flex-shrink-0 border border-gray-200" />
              ) : (
                <div className="w-32 h-40 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs flex-shrink-0 border border-gray-200">
                  No cover
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-gray-900">{m.issue_label}</p>
                <p className="text-sm text-gray-700 mt-1">
                  {m.page_count} {m.page_count === 1 ? 'page' : 'pages'} · sort {m.sort_date?.slice(0, 10)}
                </p>
                {(!m.cover_url || !m.page_urls || m.page_urls.length === 0) && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ {!m.cover_url ? 'missing cover · ' : ''}
                    {!m.page_urls || m.page_urls.length === 0 ? 'no pages uploaded' : ''}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <Link
                    href={`/admin/magazines/${m.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/admin/magazines/${m.id}/hotspots`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Hotspots
                  </Link>
                  <button
                    onClick={() => onDelete(m.id, m.issue_label)}
                    disabled={deletingId === m.id}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === m.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">
                    Share GIF
                  </p>
                  <div className="space-y-2">
                    {(['full', 'teaser', 'pingpong'] as GifVariant[]).map((variant) => {
                      const key = `${m.id}:${variant}`;
                      const url = gifUrlFor(m, variant);
                      const busy = busyKey === key;
                      const copied = copiedKey === key;
                      const err = variantError[key];
                      const hasPages = !!m.page_urls && m.page_urls.length > 0;
                      return (
                        <div key={variant} className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onGenerateGif(m, variant, !!url)}
                            disabled={busy || !hasPages}
                            className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!hasPages ? 'Upload pages first' : url ? 'Regenerate GIF' : 'Generate GIF'}
                          >
                            {busy ? 'Generating…' : url ? `${VARIANT_LABEL[variant]} · Regenerate` : VARIANT_LABEL[variant]}
                          </button>
                          {url && (
                            <>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline truncate max-w-[180px]"
                                title={url}
                              >
                                View
                              </a>
                              <button
                                type="button"
                                onClick={() => onCopy(m.id, variant, url)}
                                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded"
                              >
                                {copied ? 'Copied' : 'Copy link'}
                              </button>
                            </>
                          )}
                          {err && (
                            <span className="text-xs text-red-600 break-words">{err}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
