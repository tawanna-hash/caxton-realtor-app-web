'use client';

/**
 * TrendingEditorModal — create/edit a trending ticker item.
 *
 * Fields:
 *   - Headline, subheadline
 *   - Thumbnail (upload to Vercel Blob or paste URL)
 *   - Article URL (internal path like /article/123 or external)
 *   - Emoji/icon prefix
 *   - Markets (RealtyLine / Newsline, at least one required)
 *   - Publish immediately OR schedule for a datetime
 *   - Expires at (optional)
 */

import { useCallback, useEffect, useState } from 'react';

export type TrendingMarket = 'realtyline' | 'newsline';

export interface TrendingItem {
  id: number;
  headline: string;
  subheadline: string | null;
  thumbnail_url: string | null;
  article_url: string;
  icon_prefix: string | null;
  markets: TrendingMarket[];
  sort_order: number;
  is_published: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface Props {
  item: TrendingItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const ICON_OPTIONS = ['🔥', '📈', '🏠', '🏛️', '📊', '📰', '⭐', '⚡', '🚨', '💰'];

/** Convert an ISO string to the "YYYY-MM-DDTHH:mm" format datetime-local expects. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/** Convert "YYYY-MM-DDTHH:mm" local input back to an ISO string. */
function localInputToIso(v: string): string | null {
  if (!v) return null;
  try { return new Date(v).toISOString(); } catch { return null; }
}

export default function TrendingEditorModal({ item, onClose, onSaved }: Props) {
  const isEdit = !!item;

  const [headline, setHeadline] = useState(item?.headline ?? '');
  const [subheadline, setSubheadline] = useState(item?.subheadline ?? '');
  const [articleUrl, setArticleUrl] = useState(item?.article_url ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(item?.thumbnail_url ?? '');
  const [iconPrefix, setIconPrefix] = useState(item?.icon_prefix ?? '🔥');
  const [markets, setMarkets] = useState<TrendingMarket[]>(item?.markets ?? ['realtyline']);
  const [sortOrder, setSortOrder] = useState<number>(item?.sort_order ?? 0);
  const [publishNow, setPublishNow] = useState<boolean>(
    () => !!(item?.is_published && (!item.published_at || new Date(item.published_at).getTime() <= Date.now())),
  );
  const [publishedAt, setPublishedAt] = useState<string>(isoToLocalInput(item?.published_at ?? null));
  const [expiresAt, setExpiresAt] = useState<string>(isoToLocalInput(item?.expires_at ?? null));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggleMarket = useCallback((m: TrendingMarket) => {
    setMarkets((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]);
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/admin/trending/upload', { method: 'POST', body: fd });
      const j = await r.json() as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || `Upload failed (${r.status})`);
      setThumbnailUrl(j.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      // reset input so the same file can be re-picked if needed
      e.target.value = '';
    }
  };

  const save = async () => {
    setError(null);
    if (!headline.trim()) { setError('Headline is required'); return; }
    if (!articleUrl.trim()) { setError('Article URL is required'); return; }
    if (markets.length === 0) { setError('Pick at least one market'); return; }

    const now = new Date().toISOString();
    const payload = {
      headline: headline.trim(),
      subheadline: subheadline.trim() || null,
      thumbnail_url: thumbnailUrl.trim() || null,
      article_url: articleUrl.trim(),
      icon_prefix: iconPrefix || '🔥',
      markets,
      sort_order: sortOrder,
      is_published: publishNow || !!publishedAt,
      published_at: publishNow ? now : localInputToIso(publishedAt),
      expires_at: localInputToIso(expiresAt),
    };

    setSaving(true);
    try {
      const url = isEdit ? `/api/admin/trending/${item!.id}` : '/api/admin/trending';
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error || `Save failed (${r.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit trending item' : 'New trending item'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center text-lg"
          >
            ✕
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Headline */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Headline <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Austin home prices dip 3.2% in Q2"
              maxLength={140}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{headline.length} / 140</div>
          </div>

          {/* Subheadline */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Subheadline (optional)</label>
            <input
              type="text"
              value={subheadline}
              onChange={(e) => setSubheadline(e.target.value)}
              placeholder="First decline since 2019 — what it means"
              maxLength={200}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Article URL */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Article URL <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              placeholder="/article/123 or https://..."
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="text-[11px] text-gray-500 mt-0.5">Internal path or external URL. Opens on tap.</div>
          </div>

          {/* Thumbnail */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Thumbnail (optional)</label>
            <div className="flex items-start gap-3">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnailUrl} alt="" className="w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                  {iconPrefix || '🔥'}
                </div>
              )}
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  disabled={uploading}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-xs file:bg-white file:hover:bg-gray-50"
                />
                <input
                  type="text"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="Or paste an image URL"
                  className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {uploading && <div className="text-xs text-gray-600">Uploading…</div>}
              </div>
            </div>
          </div>

          {/* Icon prefix */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Icon prefix</label>
            <div className="flex flex-wrap gap-1">
              {ICON_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIconPrefix(emoji)}
                  className={`w-8 h-8 rounded-md text-lg flex items-center justify-center border ${
                    iconPrefix === emoji
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                  aria-label={`Icon ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              <input
                type="text"
                value={iconPrefix}
                onChange={(e) => setIconPrefix(e.target.value.slice(0, 4))}
                placeholder="Custom"
                className="w-20 text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Markets */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Markets <span className="text-red-600">*</span>
            </label>
            <div className="flex gap-4">
              {(['realtyline', 'newsline'] as TrendingMarket[]).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markets.includes(m)}
                    onChange={() => toggleMarket(m)}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="capitalize">{m}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Timing */}
          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-start gap-2 text-sm cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span>
                <span className="font-medium text-gray-900">Publish immediately</span>
                <span className="block text-xs text-gray-600">Item goes live as soon as it&apos;s saved.</span>
              </span>
            </label>

            {!publishNow && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Schedule for</label>
                <input
                  type="datetime-local"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <div className="text-[11px] text-gray-500 mt-0.5">Leave blank to save as draft (not published).</div>
              </div>
            )}

            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Expires (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <div className="text-[11px] text-gray-500 mt-0.5">After this time, the item stops appearing.</div>
            </div>
          </div>

          {/* Sort order */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Sort order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className="w-24 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="text-[11px] text-gray-500 mt-0.5">Lower numbers appear first. Use ↑/↓ in the list for quick swaps.</div>
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || uploading}
            className="text-sm px-4 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
