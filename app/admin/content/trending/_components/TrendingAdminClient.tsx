'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PUB_ACTIVE } from '@/lib/publications';
import TrendingEditorModal, { type TrendingItem, type TrendingMarket } from './TrendingEditorModal';

type MarketFilter = 'all' | TrendingMarket;
type StatusFilter = 'all' | 'live' | 'scheduled' | 'draft' | 'expired';

const MARKET_LABELS = Object.fromEntries(
  PUB_ACTIVE.map((publication) => [publication.id, publication.shortLabel]),
) as Record<TrendingMarket, string>;

function itemStatus(it: TrendingItem): StatusFilter {
  if (!it.is_published) return 'draft';
  const now = Date.now();
  if (it.expires_at && new Date(it.expires_at).getTime() <= now) return 'expired';
  if (it.published_at && new Date(it.published_at).getTime() > now) return 'scheduled';
  return 'live';
}

function statusBadge(s: StatusFilter): { label: string; className: string } {
  switch (s) {
    case 'live':      return { label: 'Live',      className: 'bg-green-100 text-green-800' };
    case 'scheduled': return { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' };
    case 'draft':     return { label: 'Draft',     className: 'bg-gray-100 text-gray-700' };
    case 'expired':   return { label: 'Expired',   className: 'bg-red-100 text-red-800' };
    default:          return { label: 'Unknown',   className: 'bg-gray-100 text-gray-700' };
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function TrendingAdminClient() {
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<TrendingItem | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/trending', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { items: TrendingItem[] };
      setItems(j.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void reload(); });
  }, [reload]);


  // ---- PostHog stats (per-item impressions/clicks/CTR, 30d) ----
  const [trendingStats, setTrendingStats] = useState<Record<string, { impressions: number; clicks: number; ctr: number }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/metrics/trending?days=30', { credentials: 'include' });
        if (!r.ok) return;
        const body = (await r.json()) as {
          ok: boolean;
          metrics: { top_items: Array<{ trending_id: string; impressions: number; clicks: number; ctr: number }> };
        };
        if (cancelled) return;
        const map: Record<string, { impressions: number; clicks: number; ctr: number }> = {};
        for (const it of body.metrics.top_items) {
          map[it.trending_id] = { impressions: it.impressions, clicks: it.clicks, ctr: it.ctr };
        }
        setTrendingStats(map);
      } catch {
        // silent — inline stats are optional
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (marketFilter !== 'all' && !it.markets.includes(marketFilter)) return false;
      if (statusFilter !== 'all' && itemStatus(it) !== statusFilter) return false;
      return true;
    });
  }, [items, marketFilter, statusFilter]);

  const togglePublished = async (it: TrendingItem) => {
    const r = await fetch(`/api/admin/trending/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !it.is_published }),
    });
    if (r.ok) void reload();
    else alert('Update failed');
  };

  const del = async (it: TrendingItem) => {
    if (!confirm(`Delete "${it.headline}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/trending/${it.id}`, { method: 'DELETE' });
    if (r.ok) void reload();
    else alert('Delete failed');
  };

  const duplicate = async (it: TrendingItem) => {
    const r = await fetch('/api/admin/trending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headline: `${it.headline} (copy)`,
        subheadline: it.subheadline,
        thumbnail_url: it.thumbnail_url,
        article_url: it.article_url,
        icon_prefix: it.icon_prefix,
        markets: it.markets,
        sort_order: it.sort_order + 1,
        is_published: false,
      }),
    });
    if (r.ok) void reload();
    else alert('Duplicate failed');
  };

  const move = async (it: TrendingItem, direction: -1 | 1) => {
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((x) => x.id === it.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const r = await fetch('/api/admin/trending/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: [
          { id: a.id, sort_order: b.sort_order },
          { id: b.id, sort_order: a.sort_order },
        ],
      }),
    });
    if (r.ok) void reload();
    else alert('Reorder failed');
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Market</label>
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value as MarketFilter)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="all">All markets</option>
            {PUB_ACTIVE.map((publication) => (
              <option key={publication.id} value={publication.id}>
                {publication.shortLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="all">All</option>
            <option value="live">Live</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreatingNew(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 font-medium"
          >
            + New trending
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg">
          <div className="text-3xl mb-2">📰</div>
          <div className="text-sm font-medium text-gray-900 mb-1">No trending items</div>
          <div className="text-xs text-gray-600 mb-4">
            {items.length === 0 ? 'Create your first item to get started.' : 'No items match your filters.'}
          </div>
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="text-sm px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 font-medium"
            >
              + New trending
            </button>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {filtered.map((it, i) => {
            const status = itemStatus(it);
            const badge = statusBadge(status);
            return (
              <div
                key={it.id}
                className={`flex items-center gap-3 p-3 sm:p-4 ${i > 0 ? 'border-t border-gray-100' : ''}`}
              >
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => void move(it, -1)}
                    aria-label="Move up"
                    className="w-5 h-5 text-xs text-gray-400 hover:text-gray-900 border border-gray-200 rounded"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => void move(it, 1)}
                    aria-label="Move down"
                    className="w-5 h-5 text-xs text-gray-400 hover:text-gray-900 border border-gray-200 rounded"
                  >↓</button>
                </div>

                {it.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                    {it.icon_prefix || '🔥'}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                    {it.markets.map((m) => (
                      <span key={m} className="text-[10px] uppercase tracking-wider font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        {MARKET_LABELS[m]}
                      </span>
                    ))}
                    <span className="text-[10px] text-gray-500 tabular-nums">#{it.sort_order}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-900 truncate">{it.headline}</div>
                  {trendingStats[it.id] && (
                    <div className="mt-0.5 text-xs text-gray-500 tabular-nums">
                      <span title="Impressions">👁 {trendingStats[it.id].impressions.toLocaleString()}</span>
                      <span className="mx-1.5 text-gray-300">·</span>
                      <span title="Clicks">👆 {trendingStats[it.id].clicks.toLocaleString()}</span>
                      <span className="mx-1.5 text-gray-300">·</span>
                      <span title="Click-through rate">{trendingStats[it.id].ctr}%</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-600 mt-0.5">
                    Published: {fmtDate(it.published_at)} · Expires: {fmtDate(it.expires_at)}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(it)}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void togglePublished(it)}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    {it.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void duplicate(it)}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => void del(it)}
                    className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(editing || creatingNew) && (
        <TrendingEditorModal
          item={editing}
          onClose={() => { setEditing(null); setCreatingNew(false); }}
          onSaved={() => { setEditing(null); setCreatingNew(false); void reload(); }}
        />
      )}
    </div>
  );
}
