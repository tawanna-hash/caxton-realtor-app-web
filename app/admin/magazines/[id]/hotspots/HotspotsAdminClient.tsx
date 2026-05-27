// app/admin/magazines/[id]/hotspots/HotspotsAdminClient.tsx
//
// Hotspot editor UI. The user sees magazine pages with existing hotspots
// drawn as overlays, can click to add new ones, drag/resize, and configure
// each via a modal. Auto-saves to /api/admin/hotspots/[id] on every change.
//
// Architecture: ONE source of truth in `hotspots` state. Every interaction
// either calls a mutation function (which optimistically updates state, then
// fires an API call), or queues an auto-save in a debouncer.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Rnd } from 'react-rnd';
import type { Magazine } from '@/lib/magazines';
import type { Hotspot, HotspotConfig } from '@/lib/hotspots';
import {
  DEFAULT_NEW_RECT,
  TYPE_LABELS,
  TYPE_COLORS,
  clampRect,
  formatRelativeTime,
  sortHotspots,
} from '@/lib/hotspot-editor-helpers';
import HotspotConfigModal from '@/components/hotspot-editor/HotspotConfigModal';

type PrevIssue = {
  id: number;
  publication: 'austin' | 'san_antonio';
  issue_label: string;
  hotspot_count: number;
};

interface Props {
  magazine: Magazine;
  initialHotspots: Hotspot[];
  prevIssues: PrevIssue[];
}

type ViewMode = 'single' | 'spread';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function HotspotsAdminClient({ magazine, initialHotspots, prevIssues }: Props) {
  // ----- View state -----
  const [viewMode, setViewMode] = useState<ViewMode>('spread');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);

  // ----- Hotspot state (canonical client copy) -----
  const [hotspots, setHotspots] = useState<Hotspot[]>(() => sortHotspots(initialHotspots));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingHotspot, setEditingHotspot] = useState<Hotspot | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // ----- Save state -----
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, setTick] = useState(0); // forces save indicator to re-render

  // ----- Copy-from-previous dialog -----
  const [showCopyDialog, setShowCopyDialog] = useState(false);

  // Tick every 10s so the "saved Xs ago" indicator updates.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // ----- Derived state -----
  const draftCount = useMemo(() => hotspots.filter((h) => !h.is_published).length, [hotspots]);
  const visiblePageIdxs = useMemo((): number[] => {
    if (viewMode === 'single') return [currentPageIdx];
    // Spread mode: cover alone, then pairs. matches consumer reader layout.
    if (currentPageIdx === 0) return [0];
    const leftIdx = currentPageIdx % 2 === 1 ? currentPageIdx : currentPageIdx - 1;
    return [leftIdx, leftIdx + 1].filter((i) => i < magazine.page_count);
  }, [viewMode, currentPageIdx, magazine.page_count]);

  // ============================================================
  // MUTATIONS
  // ============================================================

  // Create a new hotspot. POSTs to admin endpoint, replaces optimistic
  // row with server-returned row on success.
  const createHotspot = useCallback(async (pageIdx: number) => {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/admin/magazines/${magazine.id}/hotspots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_idx: pageIdx,
          ...DEFAULT_NEW_RECT,
          // Internal API expects x/y/w/h not x_frac etc.
          x: DEFAULT_NEW_RECT.x_frac,
          y: DEFAULT_NEW_RECT.y_frac,
          w: DEFAULT_NEW_RECT.w_frac,
          h: DEFAULT_NEW_RECT.h_frac,
          type: 'link',
          config: { type: 'link', url: 'https://example.com', open_in: 'new_tab' },
          label: '',
          advertiser_name: '',
          is_published: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const newHotspot = data.hotspot as Hotspot;
      setHotspots((prev) => sortHotspots([...prev, newHotspot]));
      setSelectedId(newHotspot.id);
      setEditingHotspot(newHotspot);
      setSaveState('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      console.error('[hotspot-editor] create failed:', err);
      setSaveState('error');
    }
  }, [magazine.id]);

  // Update an existing hotspot. Optimistic — apply locally first, then
  // PATCH. If PATCH fails, the UI shows the failed state via saveState.
  const updateHotspot = useCallback(async (id: number, updates: Partial<Hotspot> & { config?: HotspotConfig }) => {
    setSaveState('saving');
    // Optimistic update.
    setHotspots((prev) => prev.map((h) => h.id === id ? { ...h, ...updates } as Hotspot : h));
    try {
      // Translate x_frac/etc to x/y/w/h for the API.
      const apiBody: Record<string, unknown> = {};
      if (updates.x_frac !== undefined) apiBody.x = updates.x_frac;
      if (updates.y_frac !== undefined) apiBody.y = updates.y_frac;
      if (updates.w_frac !== undefined) apiBody.w = updates.w_frac;
      if (updates.h_frac !== undefined) apiBody.h = updates.h_frac;
      if (updates.page_idx !== undefined) apiBody.page_idx = updates.page_idx;
      if (updates.type !== undefined) apiBody.type = updates.type;
      if (updates.config !== undefined) apiBody.config = updates.config;
      if (updates.label !== undefined) apiBody.label = updates.label;
      if (updates.advertiser_name !== undefined) apiBody.advertiser_name = updates.advertiser_name;
      if (updates.is_published !== undefined) apiBody.is_published = updates.is_published;

      const res = await fetch(`/api/admin/hotspots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Replace with server-canonical version (timestamps, etc.).
      setHotspots((prev) => prev.map((h) => h.id === id ? data.hotspot : h));
      setSaveState('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      console.error('[hotspot-editor] update failed:', err);
      setSaveState('error');
    }
  }, []);

  // Delete a hotspot.
  const deleteHotspot = useCallback(async (id: number) => {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/admin/hotspots/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setHotspots((prev) => prev.filter((h) => h.id !== id));
      setSelectedId((sid) => sid === id ? null : sid);
      setSaveState('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      console.error('[hotspot-editor] delete failed:', err);
      setSaveState('error');
    }
  }, []);

  // Publish all drafts.
  const publishAllDrafts = useCallback(async () => {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/admin/magazines/${magazine.id}/hotspots-publish-all`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHotspots(sortHotspots(data.hotspots as Hotspot[]));
      setSaveState('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      console.error('[hotspot-editor] publish-all failed:', err);
      setSaveState('error');
    }
  }, [magazine.id]);

  // Copy hotspots from a previous issue.
  const copyFromPrevious = useCallback(async (sourceMagazineId: number, publishedOnly: boolean) => {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/admin/magazines/${magazine.id}/hotspots-bulk-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_magazine_id: sourceMagazineId, published_only: publishedOnly }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHotspots(sortHotspots(data.hotspots as Hotspot[]));
      setSaveState('saved');
      setLastSavedAt(new Date());
      setShowCopyDialog(false);
    } catch (err) {
      console.error('[hotspot-editor] copy-from-prev failed:', err);
      setSaveState('error');
    }
  }, [magazine.id]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-stone-100 pb-12">
      {/* ===== HEADER ===== */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
          <Link
            href={`/admin/magazines/${magazine.id}`}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            ← Back
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">
              Hotspots · {magazine.publication === 'austin' ? 'RealtyLine' : 'Newsline SA'} · {magazine.issue_label}
            </h1>
            <p className="text-xs text-gray-500">
              {hotspots.length} hotspot{hotspots.length === 1 ? '' : 's'} · {magazine.page_count} pages
            </p>
          </div>

          {/* View mode toggle */}
          <div className="inline-flex rounded-md border border-gray-300 bg-white">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`px-3 py-1.5 text-sm font-medium rounded-l-md ${viewMode === 'single' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setViewMode('spread')}
              className={`px-3 py-1.5 text-sm font-medium rounded-r-md border-l border-gray-300 ${viewMode === 'spread' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Spread
            </button>
          </div>

          <SaveIndicator saveState={saveState} lastSavedAt={lastSavedAt} />

          {prevIssues.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCopyDialog(true)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Copy from previous
            </button>
          )}
        </div>

        {/* Drafts banner */}
        {draftCount > 0 && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-3">
            <span className="text-sm text-amber-900">
              <strong>{draftCount}</strong> draft{draftCount === 1 ? '' : 's'} not yet published.
            </span>
            <button
              type="button"
              onClick={publishAllDrafts}
              className="text-xs font-medium px-3 py-1 bg-amber-900 text-white rounded hover:bg-amber-800"
            >
              Publish all drafts
            </button>
          </div>
        )}
      </div>

      {/* ===== PAGE NAVIGATION ===== */}
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={() => setCurrentPageIdx((i) => Math.max(0, i - (viewMode === 'spread' ? 2 : 1)))}
          disabled={currentPageIdx === 0}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          ← Previous
        </button>
        <div className="text-sm text-gray-700">
          {viewMode === 'spread' && visiblePageIdxs.length === 2
            ? <>Pages <strong>{visiblePageIdxs[0] + 1}–{visiblePageIdxs[1] + 1}</strong> of {magazine.page_count}</>
            : <>Page <strong>{currentPageIdx + 1}</strong> of {magazine.page_count}</>
          }
        </div>
        <input
          type="number"
          min={1}
          max={magazine.page_count}
          value={currentPageIdx + 1}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isInteger(n) && n >= 1 && n <= magazine.page_count) {
              setCurrentPageIdx(n - 1);
            }
          }}
          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
        />
        <button
          type="button"
          onClick={() => setCurrentPageIdx((i) => Math.min(magazine.page_count - 1, i + (viewMode === 'spread' ? 2 : 1)))}
          disabled={currentPageIdx >= magazine.page_count - 1}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Next →
        </button>
      </div>

      {/* ===== PAGES ===== */}
      <div className="p-4 flex justify-center">
        <div className={`flex gap-2 ${viewMode === 'spread' ? '' : ''}`}>
          {visiblePageIdxs.map((pageIdx) => (
            <EditorPage
              key={pageIdx}
              pageIdx={pageIdx}
              pageUrl={magazine.page_urls?.[pageIdx]}
              hotspots={hotspots.filter((h) => h.page_idx === pageIdx)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={setEditingHotspot}
              onRequestDelete={setPendingDeleteId}
              onCreate={() => createHotspot(pageIdx)}
              onUpdatePosition={(id, rect) => updateHotspot(id, rect)}
            />
          ))}
        </div>
      </div>

      {/* ===== CONFIG MODAL ===== */}
      {editingHotspot && (
        <HotspotConfigModal
          hotspot={editingHotspot}
          onSave={async (updates) => {
            await updateHotspot(editingHotspot.id, updates);
            setEditingHotspot(null);
          }}
          onClose={() => setEditingHotspot(null)}
          onRequestDelete={() => {
            setPendingDeleteId(editingHotspot.id);
            setEditingHotspot(null);
          }}
        />
      )}

      {/* ===== DELETE CONFIRMATION ===== */}
      {pendingDeleteId !== null && (
        <DeleteConfirmDialog
          hotspot={hotspots.find((h) => h.id === pendingDeleteId)!}
          onConfirm={async () => {
            await deleteHotspot(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {/* ===== COPY-FROM-PREVIOUS DIALOG ===== */}
      {showCopyDialog && (
        <CopyFromPreviousDialog
          prevIssues={prevIssues}
          existingCount={hotspots.length}
          onConfirm={copyFromPrevious}
          onCancel={() => setShowCopyDialog(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Save indicator (small visual cue at top right)
// ============================================================
function SaveIndicator({ saveState, lastSavedAt }: { saveState: SaveState; lastSavedAt: Date | null }) {
  if (saveState === 'saving') return <span className="text-xs text-gray-500">Saving…</span>;
  if (saveState === 'error') return <span className="text-xs text-red-600">Save failed</span>;
  if (saveState === 'saved' && lastSavedAt) {
    return <span className="text-xs text-green-700">Saved {formatRelativeTime(lastSavedAt)}</span>;
  }
  return null;
}

// ============================================================
// Single editor page — image + draggable/resizable hotspots
// ============================================================
interface EditorPageProps {
  pageIdx: number;
  pageUrl: string | undefined;
  hotspots: Hotspot[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onEdit: (h: Hotspot) => void;
  onRequestDelete: (id: number) => void;
  onCreate: () => void;
  onUpdatePosition: (id: number, rect: { x_frac: number; y_frac: number; w_frac: number; h_frac: number }) => void;
}

function EditorPage({
  pageIdx, pageUrl, hotspots, selectedId,
  onSelect, onEdit, onRequestDelete, onCreate, onUpdatePosition,
}: EditorPageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Update measured size whenever image loads OR window resizes.
  useEffect(() => {
    const updateSize = () => {
      if (imgRef.current) {
        const rect = imgRef.current.getBoundingClientRect();
        setImgSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [pageUrl]);

  if (!pageUrl) {
    return (
      <div className="flex items-center justify-center bg-gray-200 text-gray-500 text-sm" style={{ width: 360, height: 480 }}>
        Page {pageIdx + 1} unavailable
      </div>
    );
  }

  return (
    <div className="relative inline-block shadow-2xl bg-white">
      {/* Click background to deselect */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={pageUrl}
        alt={`Page ${pageIdx + 1}`}
        className="block max-h-[80vh] w-auto select-none"
        style={{ maxWidth: 'min(45vw, 600px)' }}
        onLoad={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setImgSize({ w: r.width, h: r.height });
        }}
        onClick={() => onSelect(null)}
        draggable={false}
      />

      {/* Hotspot overlays */}
      {imgSize.w > 0 && hotspots.map((h) => (
        <DraggableHotspot
          key={h.id}
          hotspot={h}
          containerW={imgSize.w}
          containerH={imgSize.h}
          selected={selectedId === h.id}
          onSelect={() => onSelect(h.id)}
          onEdit={() => onEdit(h)}
          onRequestDelete={() => onRequestDelete(h.id)}
          onChange={(rect) => onUpdatePosition(h.id, rect)}
        />
      ))}

      {/* Add hotspot floating button */}
      <button
        type="button"
        onClick={onCreate}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 whitespace-nowrap"
      >
        + Add hotspot to page {pageIdx + 1}
      </button>
    </div>
  );
}

// ============================================================
// A single draggable/resizable hotspot, wrapped in react-rnd
// ============================================================
function DraggableHotspot({
  hotspot, containerW, containerH, selected,
  onSelect, onEdit, onRequestDelete, onChange,
}: {
  hotspot: Hotspot;
  containerW: number;
  containerH: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onChange: (rect: { x_frac: number; y_frac: number; w_frac: number; h_frac: number }) => void;
}) {
  const colors = TYPE_COLORS[hotspot.type];
  const px = hotspot.x_frac * containerW;
  const py = hotspot.y_frac * containerH;
  const pw = hotspot.w_frac * containerW;
  const ph = hotspot.h_frac * containerH;
  const opacity = hotspot.is_published ? 1 : 0.55;
  const dashed = !hotspot.is_published;

  return (
    <Rnd
      size={{ width: pw, height: ph }}
      position={{ x: px, y: py }}
      bounds="parent"
      onDragStop={(_, d) => {
        const clamped = clampRect({
          x_frac: d.x / containerW,
          y_frac: d.y / containerH,
          w_frac: hotspot.w_frac,
          h_frac: hotspot.h_frac,
        });
        onChange(clamped);
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        const clamped = clampRect({
          x_frac: position.x / containerW,
          y_frac: position.y / containerH,
          w_frac: ref.offsetWidth / containerW,
          h_frac: ref.offsetHeight / containerH,
        });
        onChange(clamped);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        background: colors.fill,
        border: `2px ${dashed ? 'dashed' : 'solid'} ${colors.stroke}`,
        outline: selected ? '2px solid black' : 'none',
        outlineOffset: 1,
        opacity,
        cursor: 'move',
      }}
    >
      {/* Type label */}
      <div className="absolute -top-6 left-0 flex items-center gap-1 text-xs font-medium whitespace-nowrap pointer-events-none">
        <span className={`px-1.5 py-0.5 bg-white border border-gray-300 rounded shadow-sm ${colors.text}`}>
          {TYPE_LABELS[hotspot.type]}{hotspot.label ? ` · ${hotspot.label}` : ''}
        </span>
      </div>
      {/* Action buttons (only when selected) */}
      {selected && (
        <div className="absolute -bottom-9 right-0 flex gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="px-2 py-1 text-xs font-medium bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            className="px-2 py-1 text-xs font-medium bg-white border border-red-300 text-red-700 rounded shadow-sm hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </Rnd>
  );
}

// ============================================================
// Delete confirmation
// ============================================================
function DeleteConfirmDialog({
  hotspot, onConfirm, onCancel,
}: {
  hotspot: Hotspot;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete this hotspot?</h2>
        <p className="text-sm text-gray-700 mb-4">
          {hotspot.label
            ? <>You&apos;ll lose &ldquo;{hotspot.label}&rdquo; (page {hotspot.page_idx + 1}). This can&apos;t be undone.</>
            : <>This will permanently delete the {TYPE_LABELS[hotspot.type]} hotspot on page {hotspot.page_idx + 1}.</>
          }
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Copy-from-previous-issue dialog
// ============================================================
function CopyFromPreviousDialog({
  prevIssues, existingCount, onConfirm, onCancel,
}: {
  prevIssues: PrevIssue[];
  existingCount: number;
  onConfirm: (sourceId: number, publishedOnly: boolean) => void;
  onCancel: () => void;
}) {
  const [sourceId, setSourceId] = useState<number | null>(prevIssues[0]?.id ?? null);
  const [publishedOnly, setPublishedOnly] = useState(true);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Copy hotspots from previous issue</h2>
        <p className="text-sm text-gray-700 mb-4">
          Hotspots from the selected issue will be <strong>added to this magazine</strong>{' '}
          as drafts. {existingCount > 0 && <>You already have {existingCount} hotspot{existingCount === 1 ? '' : 's'} here; the copies are added on top.</>}
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Source issue</label>
        <select
          value={sourceId ?? ''}
          onChange={(e) => setSourceId(Number(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-4"
        >
          {prevIssues.map((p) => (
            <option key={p.id} value={p.id}>
              {p.issue_label} ({p.hotspot_count} hotspot{p.hotspot_count === 1 ? '' : 's'})
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={publishedOnly}
            onChange={(e) => setPublishedOnly(e.target.checked)}
          />
          <span className="text-sm text-gray-700">Only copy published hotspots (recommended)</span>
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => sourceId !== null && onConfirm(sourceId, publishedOnly)}
            disabled={sourceId === null}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded hover:bg-gray-800 disabled:opacity-40"
          >
            Copy hotspots
          </button>
        </div>
      </div>
    </div>
  );
}
