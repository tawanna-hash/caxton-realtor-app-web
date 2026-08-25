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
import { useUrlNumber, useUrlString } from '@/lib/use-url-state';
import { Rnd } from 'react-rnd';
import type { Magazine } from '@/lib/magazines';
import { PUBLICATION_LABELS } from '@/lib/publications';
import type { Hotspot, HotspotConfig } from '@/lib/hotspots';
import {
  DEFAULT_NEW_RECT,
  TYPE_LABELS,
  TYPE_COLORS,
  TYPE_ICONS,
  clampRect,
  computeZMove,
  formatRelativeTime,
  sortHotspots,
  type ZMove,
} from '@/lib/hotspot-editor-helpers';
import HotspotConfigModal from '@/components/hotspot-editor/HotspotConfigModal';

type PrevIssue = {
  id: number;
  publication: 'austin' | 'san_antonio' | 'houston' | 'dallas';
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
  // URL-backed so refresh (F5, iOS pull-to-refresh) restores the same spread
  // and view mode. Defaults are stripped from the URL so it stays clean.
  const [viewMode, setViewMode] = useUrlString<ViewMode>('view', 'spread');
  const [currentPageIdx, setCurrentPageIdx] = useUrlNumber('p', 0);

  // ----- Hotspot state (canonical client copy) -----
  const [hotspots, setHotspots] = useState<Hotspot[]>(() => sortHotspots(initialHotspots));
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Mac-aware modifier label. Detected on mount to avoid SSR hydration
  // mismatch (window/navigator aren't available server-side).
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent || '';
    const plat = navigator.platform || '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform sniff must run client-side; SSR has no navigator
    setIsMac(/Mac|iPhone|iPad|iPod/.test(plat) || /Mac OS X/.test(ua));
  }, []);
  const [editingHotspot, setEditingHotspot] = useState<Hotspot | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // ----- Save state -----
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, setTick] = useState(0); // forces save indicator to re-render

  // ----- Copy-from-previous dialog -----
  const [showCopyDialog, setShowCopyDialog] = useState(false);

  // ----- Extract-all state (unified: PDF links + text scan + QR) -----
  // Rewritten from v1's two-endpoint flow into a single call so results are
  // atomic (all imports wiped + re-inserted in one transaction on the
  // server) and the UI has one loading state instead of two racy ones.
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // NDJSON progress from the streaming extract-all endpoint. current is the
  // number of pages committed so far; total is the magazine page count.
  // Cleared when a run finishes (success or error).
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number } | null>(null);
  // Page index currently being processed by the per-page endpoint, so the
  // per-page "Extract page" button can show a spinner state without
  // blocking clicks on other pages.
  const [extractingPage, setExtractingPage] = useState<number | null>(null);
  const [extractResult, setExtractResult] = useState<{
    inserted: number;
    skipped_duplicates: number;
    auto_linked_advertisers: number;
    findings: { pdf_links: number; text_scan: number; qr_codes: number; logo_matches: number };
  } | null>(null);

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

  // Number every hotspot on the visible spread. The number is the same on
  // the canvas pin and in the sidebar row, so users can eye-track between
  // the spatial view (pin "3") and the semantic view (row "3") instantly.
  // Sort order matches the sidebar so numbering feels natural top-to-bottom.
  const spreadNumberById = useMemo((): Map<number, number> => {
    const visible = hotspots.filter((h) => visiblePageIdxs.includes(h.page_idx));
    visible.sort((a, b) => {
      if (a.page_idx !== b.page_idx) return a.page_idx - b.page_idx;
      const az = a.z_index ?? 0;
      const bz = b.z_index ?? 0;
      if (az !== bz) return bz - az;
      return a.id - b.id;
    });
    const map = new Map<number, number>();
    visible.forEach((h, i) => map.set(h.id, i + 1));
    return map;
  }, [hotspots, visiblePageIdxs]);

  // ============================================================
  // MUTATIONS
  // ============================================================

  // Create a new hotspot. POSTs to admin endpoint, replaces optimistic
  // row with server-returned row on success.
  const createHotspot = useCallback(async (pageIdx: number) => {
    setSaveState('saving');
    try {
      // New hotspots default to a "Link" draft with a placeholder URL.
      // The user replaces these values via the config modal that opens
      // immediately after creation. Server-side validation requires every
      // type's config to have its required fields, so we cannot send an
      // empty config — the placeholder satisfies validation but is
      // obviously a placeholder for the editor to replace.
      const res = await fetch(`/api/admin/magazines/${magazine.id}/hotspots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_idx: pageIdx,
          x: DEFAULT_NEW_RECT.x_frac,
          y: DEFAULT_NEW_RECT.y_frac,
          w: DEFAULT_NEW_RECT.w_frac,
          h: DEFAULT_NEW_RECT.h_frac,
          type: 'link',
          config: { type: 'link', url: 'https://example.com', open_in: 'new_tab' },
          label: '',
          advertiser_name: '',
          is_published: false,
          advertiser_id: null,
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
      if (updates.advertiser_id !== undefined) apiBody.advertiser_id = updates.advertiser_id;

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

  // Move a hotspot forward/backward in the z-order for its page.
  // Uses computeZMove to pick a target z_index that lands the hotspot in the
  // right slot without renumbering every row.
  const moveHotspotZ = useCallback(async (id: number, move: ZMove) => {
    setHotspots((prev) => {
      const target = prev.find((h) => h.id === id);
      if (!target) return prev;
      const pageHotspots = prev.filter((h) => h.page_idx === target.page_idx);
      const nextZ = computeZMove(pageHotspots, id, move);
      if (nextZ === null) return prev;
      // Fire PATCH separately — we already have the optimistic array.
      setSaveState('saving');
      fetch(`/api/admin/hotspots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ z_index: nextZ }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`z-move failed (${res.status})`);
          setSaveState('saved');
          setLastSavedAt(new Date());
        })
        .catch((err) => {
          console.error('[hotspot-editor] z-move failed:', err);
          setSaveState('error');
        });
      return sortHotspots(prev.map((h) => h.id === id ? { ...h, z_index: nextZ } : h));
    });
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

  // Dedupe: scan every page for hotspots that share the same normalized
  // URL / email / phone identity, keep the best row per group, delete the
  // rest. Safe to run repeatedly — idempotent when there are no dupes.
  const dedupeHotspots = useCallback(async () => {
    if (!confirm('Delete duplicate hotspots on every page? Keeps the best row per URL/email/phone.')) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/admin/magazines/${magazine.id}/hotspots-dedupe`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHotspots(sortHotspots(data.hotspots as Hotspot[]));
      setSaveState('saved');
      setLastSavedAt(new Date());
      console.log(
        `[hotspot-editor] dedupe: scanned ${data.scanned} · ${data.dupe_groups} dupe groups · deleted ${data.deleted}`,
      );
    } catch (err) {
      console.error('[hotspot-editor] dedupe failed:', err);
      setSaveState('error');
    }
  }, [magazine.id]);

  // Streaming auto-extract. Consumes NDJSON from /extract-all:
  //   { type: 'start', page_count }
  //   { type: 'page', page_idx, inserted, ... }   — one per committed page
  //   { type: 'done', hotspots, diagnostics } OR { type: 'error', ... }
  //
  // Per-page commits mean if the stream dies mid-way, earlier pages are
  // already in the DB — the user can hit Extract-all again to pick up
  // where it left off (the page-scoped wipe won't touch already-committed
  // pages beyond the crash point until they're re-processed).
  const runExtractAll = useCallback(async () => {
    setExtracting(true);
    setExtractProgress(null);
    setSaveState('saving');
    try {
      const res = await fetch(`/api/admin/magazines/${magazine.id}/extract-all`, {
        method: 'POST',
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let total = 0;
      let current = 0;
      let finalHotspots: Hotspot[] | null = null;
      let finalDiagnostics: {
        inserted: number;
        skipped_duplicates: number;
        auto_linked_advertisers: number;
        findings: { pdf_links: number; text_scan: number; qr_codes: number; logo_matches: number };
      } | null = null;
      let streamError: string | null = null;

      // Drain the stream line-by-line. Each NDJSON line is a complete JSON
      // object; buf holds the trailing partial until the next chunk.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (!line) continue;
          let evt: Record<string, unknown>;
          try { evt = JSON.parse(line); }
          catch { continue; }
          if (evt.type === 'start') {
            total = Number(evt.page_count) || 0;
            setExtractProgress({ current: 0, total });
          } else if (evt.type === 'page') {
            current += 1;
            setExtractProgress({ current, total });
          } else if (evt.type === 'done') {
            finalHotspots = evt.hotspots as Hotspot[];
            const d = evt.diagnostics as {
              inserted: number;
              skipped_duplicates: number;
              auto_linked_advertisers: number;
              findings: { pdf_links: number; text_scan: number; qr_codes: number; logo_matches: number };
            };
            finalDiagnostics = d;
          } else if (evt.type === 'error') {
            streamError = String(evt.message ?? 'extraction failed');
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!finalHotspots || !finalDiagnostics) throw new Error('stream ended without done event');

      setHotspots(sortHotspots(finalHotspots));
      setExtractResult({
        inserted: finalDiagnostics.inserted,
        skipped_duplicates: finalDiagnostics.skipped_duplicates,
        auto_linked_advertisers: finalDiagnostics.auto_linked_advertisers,
        findings: finalDiagnostics.findings,
      });
      setSaveState('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      console.error('[hotspot-editor] extract-all failed:', err);
      setSaveState('error');
      setExtractResult(null);
    } finally {
      setExtracting(false);
      setExtractProgress(null);
    }
  }, [magazine.id]);

  // Per-page extract. Same four passes as extract-all but scoped to one
  // page: wipes source='pdf_import' rows for that page only, then re-
  // inserts fresh findings. Edited-imports (source='manual', was_imported
  // true) on this page survive because the wipe filter targets 'pdf_import'.
  const runExtractPage = useCallback(async (pageIdx: number) => {
    setExtractingPage(pageIdx);
    setSaveState('saving');
    try {
      const res = await fetch(`/api/admin/magazines/${magazine.id}/extract-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_idx: pageIdx }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHotspots(sortHotspots(data.hotspots as Hotspot[]));
      setSaveState('saved');
      setLastSavedAt(new Date());
      // Surface a concise summary so it's obvious what happened. Prefer a
      // proper snackbar/log; for now, alert() keeps the fix scoped.
      const d = data.diagnostics as {
        findings?: { pdf_links: number; text_scan: number; qr_codes: number; logo_matches: number };
        inserted?: number;
        skipped_duplicates?: number;
      } | undefined;
      if (d?.findings) {
        const f = d.findings;
        const parts = [
          `${f.pdf_links} PDF link${f.pdf_links === 1 ? '' : 's'}`,
          `${f.text_scan} text hit${f.text_scan === 1 ? '' : 's'}`,
          `${f.qr_codes} QR`,
          `${f.logo_matches} logo${f.logo_matches === 1 ? '' : 's'}`,
        ].join(' · ');
        console.log(`[hotspot-editor] extract-page ${pageIdx + 1}: found ${parts} — inserted ${d.inserted ?? 0}, skipped ${d.skipped_duplicates ?? 0} dupes`);
      }
    } catch (err) {
      console.error('[hotspot-editor] extract-page failed:', err);
      setSaveState('error');
    } finally {
      setExtractingPage(null);
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

  // ----- Stable modal callbacks -----
  // The modal is a controlled child. If we passed inline arrows to its
  // props they would get a new identity every parent render (e.g. every
  // 10s from the Saved-indicator ticker), which would refire any effect
  // in the modal that depends on those callbacks. We stabilise them via
  // useCallback + a ref for editingHotspot so the current row is always
  // reachable without adding it to the deps.
  const editingHotspotRef = useRef(editingHotspot);
  useEffect(() => { editingHotspotRef.current = editingHotspot; }, [editingHotspot]);

  const handleModalSave = useCallback(async (updates: Parameters<typeof updateHotspot>[1]) => {
    const current = editingHotspotRef.current;
    if (!current) return;
    await updateHotspot(current.id, updates);
    setEditingHotspot(null);
  }, [updateHotspot]);

  const handleModalClose = useCallback(() => {
    setEditingHotspot(null);
  }, []);

  const handleModalRequestDelete = useCallback(() => {
    const current = editingHotspotRef.current;
    if (!current) return;
    setPendingDeleteId(current.id);
    setEditingHotspot(null);
  }, []);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-white pb-12">
      {/* ===== HEADER ===== */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Breadcrumb: All Magazines / this magazine. The hotspot editor is
              two levels deep, so a single back arrow was leaving users without
              a one-click escape to the magazines list. */}
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/admin/magazines"
              className="text-gray-600 hover:text-gray-900"
            >
              All Magazines
            </Link>
            <span className="text-gray-400" aria-hidden>
              /
            </span>
            <Link
              href={`/admin/magazines/${magazine.id}`}
              className="text-gray-600 hover:text-gray-900"
            >
              {magazine.issue_label}
            </Link>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">
              Hotspots · {PUBLICATION_LABELS[magazine.publication]} · {magazine.issue_label}
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
          <button
            type="button"
            onClick={dedupeHotspots}
            disabled={extracting}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            title="Find hotspots on the same page that point to the same URL / email / phone, keep the best one, delete the rest."
          >
            Remove duplicates
          </button>
          <button
            type="button"
            onClick={() => setShowExtractDialog(true)}
            disabled={extracting}
            className="px-3 py-1.5 text-sm font-medium text-white bg-purple-700 rounded-md hover:bg-purple-800 disabled:opacity-50"
            title="Auto-populate hotspots: embedded PDF links, page-text scan (emails/phones/URLs), QR codes, and logo matches. Manual and edited-import hotspots are preserved."
          >
            {extracting
              ? (extractProgress
                  ? `Extracting… ${extractProgress.current}/${extractProgress.total}`
                  : 'Extracting…')
              : 'Extract all links'}
          </button>
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
              className="text-xs font-medium px-3 py-1 bg-amber-900 text-white rounded-md hover:bg-amber-800"
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
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
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
          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md text-center"
        />
        <button
          type="button"
          onClick={() => setCurrentPageIdx((i) => Math.min(magazine.page_count - 1, i + (viewMode === 'spread' ? 2 : 1)))}
          disabled={currentPageIdx >= magazine.page_count - 1}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Next →
        </button>
      </div>

      {/* ===== Z-ORDER TOOLBAR (shown while a hotspot is selected) ===== */}
      {selectedId !== null && (
        <div className="px-4 pb-2 flex items-center justify-center gap-2 text-xs">
          <span className="text-gray-500">Layer</span>
          <button
            type="button"
            onClick={() => moveHotspotZ(selectedId, 'back')}
            className="px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
            title="Send to back"
          >
            ⇤ Back
          </button>
          <button
            type="button"
            onClick={() => moveHotspotZ(selectedId, 'backward')}
            className="px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
            title="Send backward"
          >
            ← Backward
          </button>
          <button
            type="button"
            onClick={() => moveHotspotZ(selectedId, 'forward')}
            className="px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
            title="Bring forward"
          >
            Forward →
          </button>
          <button
            type="button"
            onClick={() => moveHotspotZ(selectedId, 'front')}
            className="px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
            title="Bring to front"
          >
            Front ⇥
          </button>
          <span className="text-gray-400">·</span>
          <span className="text-gray-500">{isMac ? 'Option-click' : 'Alt-click'} to cycle overlapping hotspots</span>
        </div>
      )}

      {/* ===== PAGES + SIDEBAR ===== */}
      <div className="p-4 flex justify-center items-start gap-6">
        <div className="flex gap-2">
          {visiblePageIdxs.map((pageIdx) => (
            <EditorPage
              key={pageIdx}
              pageIdx={pageIdx}
              pageUrl={magazine.page_urls?.[pageIdx]}
              hotspots={hotspots.filter((h) => h.page_idx === pageIdx)}
              spreadNumberById={spreadNumberById}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={setEditingHotspot}
              onRequestDelete={setPendingDeleteId}
              onCreate={() => createHotspot(pageIdx)}
              onExtract={() => runExtractPage(pageIdx)}
              extracting={extractingPage === pageIdx}
              onUpdatePosition={(id, rect) => updateHotspot(id, rect)}
            />
          ))}
        </div>
        <SpreadSidebar
          hotspots={hotspots.filter((h) => visiblePageIdxs.includes(h.page_idx))}
          spreadNumberById={spreadNumberById}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onEdit={setEditingHotspot}
          onMoveZ={moveHotspotZ}
        />
      </div>

      {/* ===== CONFIG MODAL =====
           Callbacks are stable across parent re-renders so the modal's
           own effects/refs don't have to work around identity churn. */}
      {editingHotspot && (
        <HotspotConfigModal
          hotspot={editingHotspot}
          defaultPublication={magazine.publication}
          onSave={handleModalSave}
          onClose={handleModalClose}
          onRequestDelete={handleModalRequestDelete}
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

      {/* ===== EXTRACT-ALL DIALOG ===== */}
      {showExtractDialog && (
        <ImportPdfLinksDialog
          existingPdfImportCount={hotspots.filter((h) => h.source === 'pdf_import').length}
          onConfirm={async () => {
            setShowExtractDialog(false);
            await runExtractAll();
          }}
          onCancel={() => setShowExtractDialog(false)}
        />
      )}

      {/* ===== EXTRACT RESULT TOAST ===== */}
      {extractResult && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-gray-900 text-white text-sm rounded-md shadow-xl flex items-center gap-3 max-w-2xl">
          <span>
            {extractResult.inserted > 0 ? (
              <>
                Added <strong>{extractResult.inserted}</strong> hotspot{extractResult.inserted === 1 ? '' : 's'}
                {' '}({extractResult.findings.pdf_links} embedded, {extractResult.findings.text_scan} text-scan,{' '}
                {extractResult.findings.qr_codes} QR, {extractResult.findings.logo_matches} logo){extractResult.auto_linked_advertisers > 0 && (
                  <>. Linked <strong>{extractResult.auto_linked_advertisers}</strong> to advertisers.</>
                )}
              </>
            ) : (
              <>No new links found.</>
            )}
          </span>
          <button
            type="button"
            onClick={() => setExtractResult(null)}
            className="text-xs opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
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
  spreadNumberById: Map<number, number>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onEdit: (h: Hotspot) => void;
  onRequestDelete: (id: number) => void;
  onCreate: () => void;
  onExtract: () => void;
  extracting: boolean;
  onUpdatePosition: (id: number, rect: { x_frac: number; y_frac: number; w_frac: number; h_frac: number }) => void;
}

// Given a click at (x, y) in fractional page coords, return the id of the
// next hotspot at that point after `currentId` (or the topmost if none is
// currently selected). Used for alt-click cycling through stacked overlaps.
function nextOverlapId(
  pageHotspots: Hotspot[],
  currentId: number | null,
  xFrac: number,
  yFrac: number,
): number | null {
  const hits = pageHotspots.filter((h) =>
    xFrac >= h.x_frac && xFrac <= h.x_frac + h.w_frac &&
    yFrac >= h.y_frac && yFrac <= h.y_frac + h.h_frac
  );
  if (hits.length === 0) return null;
  // Order by z-index descending (topmost first) so a normal click gets the top,
  // and Alt-click cycles downward through the stack.
  hits.sort((a, b) => {
    const az = a.z_index ?? 0;
    const bz = b.z_index ?? 0;
    if (az !== bz) return bz - az;
    return b.id - a.id;
  });
  if (currentId === null) return hits[0].id;
  const curIdx = hits.findIndex((h) => h.id === currentId);
  if (curIdx < 0) return hits[0].id;
  return hits[(curIdx + 1) % hits.length].id;
}

function EditorPage({
  pageIdx, pageUrl, hotspots, spreadNumberById, selectedId,
  onSelect, onEdit, onRequestDelete, onCreate, onExtract, extracting,
  onUpdatePosition,
}: EditorPageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Update measured size whenever image loads OR window resizes.
  //
  // Cached-image bug: when the browser already has the page image in disk
  // cache, the <img> can fire `load` synchronously during React's initial
  // paint — before our `onLoad` handler is attached — so `imgSize` stays
  // {0,0} forever and the whole hotspot layer is gated off. The effect
  // below re-measures whenever `pageUrl` changes, but it can also run
  // before layout is complete (rect w=0). To cover both, we poll a couple
  // of frames with `img.complete` before giving up on the `onLoad`
  // fallback, and re-measure once naturalWidth appears.
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !imgRef.current) return false;
      const el = imgRef.current;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && el.complete && el.naturalWidth > 0) {
        setImgSize({ w: rect.width, h: rect.height });
        return true;
      }
      return false;
    };
    if (!measure()) {
      let tries = 0;
      const raf = () => {
        if (measure() || cancelled) return;
        if (++tries < 30) requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
    const onResize = () => { measure(); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
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
          const el = e.currentTarget;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            setImgSize({ w: r.width, h: r.height });
          }
        }}
        onClick={() => onSelect(null)}
        draggable={false}
      />

      {/* Hotspot overlays. Rendered in z-order ascending so higher z paints on top. */}
      {imgSize.w > 0 && [...hotspots].sort((a, b) => {
        const az = a.z_index ?? 0;
        const bz = b.z_index ?? 0;
        if (az !== bz) return az - bz;
        return a.id - b.id;
      }).map((h) => (
        <DraggableHotspot
          key={h.id}
          hotspot={h}
          number={spreadNumberById.get(h.id) ?? 0}
          containerW={imgSize.w}
          containerH={imgSize.h}
          selected={selectedId === h.id}
          onSelect={(altKey) => {
            if (altKey) {
              // Cycle through overlapping hotspots at this pixel.
              const nextId = nextOverlapId(hotspots, selectedId, h.x_frac + h.w_frac / 2, h.y_frac + h.h_frac / 2);
              onSelect(nextId);
            } else {
              onSelect(h.id);
            }
          }}
          onEdit={() => onEdit(h)}
          onRequestDelete={() => onRequestDelete(h.id)}
          onChange={(rect) => onUpdatePosition(h.id, rect)}
        />
      ))}

      {/* Independent pin-badge overlay. Rendered from hotspot coordinates
          directly (not from RND's DOM) so a pin is guaranteed to appear even
          when the underlying RND element gets into a weird state (0-size,
          clipped by transform, etc.). The RND element still owns
          drag/resize; this layer is purely visual and pointer-events:none. */}
      {imgSize.w > 0 && hotspots.map((h) => {
        const num = spreadNumberById.get(h.id) ?? 0;
        if (num === 0) return null;
        const colors = TYPE_COLORS[h.type] ?? { stroke: 'rgb(107, 114, 128)' };
        const cx = (h.x_frac + h.w_frac / 2) * imgSize.w;
        const cy = (h.y_frac + h.h_frac / 2) * imgSize.h;
        return (
          <div
            key={`pin-${h.id}`}
            className="absolute pointer-events-none"
            style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)', zIndex: 45 }}
          >
            <span
              className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[11px] font-semibold text-white rounded-full shadow ring-2 ring-white"
              style={{ background: colors.stroke }}
            >
              {num}
            </span>
          </div>
        );
      })}

      {/* Floating actions: Add hotspot + Extract page. Both hug the page's
          bottom center; Extract-page runs the same four-pass pipeline as
          Extract-all but scoped to this page (edited-imports on the page
          survive, other pages are untouched). */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onCreate}
          className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-md shadow-lg hover:bg-gray-800 whitespace-nowrap"
        >
          + Add hotspot to page {pageIdx + 1}
        </button>
        <button
          type="button"
          onClick={onExtract}
          disabled={extracting}
          title="Re-run the four extractor passes for this page only. Your edits on this page are preserved."
          className="px-2.5 py-1.5 text-xs font-medium bg-white text-gray-800 border border-gray-300 rounded-md shadow-lg hover:bg-gray-50 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {extracting ? 'Extracting…' : 'Extract page'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// A single draggable/resizable hotspot, wrapped in react-rnd
// ============================================================
//
// Visual design: the box itself carries only color + published/draft +
// PDF-import indication. Identity lives in a numbered pin in the top-left
// corner that matches the number in the sidebar row. This keeps stacked
// hotspots readable no matter how small they are or how many overlap.
// The full type + label only appears as a floating chip when selected
// (permanent) or hovered (transient).
function DraggableHotspot({
  hotspot, number, containerW, containerH, selected,
  onSelect, onEdit, onRequestDelete, onChange,
}: {
  hotspot: Hotspot;
  number: number;
  containerW: number;
  containerH: number;
  selected: boolean;
  onSelect: (altKey: boolean) => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onChange: (rect: { x_frac: number; y_frac: number; w_frac: number; h_frac: number }) => void;
}) {
  const colors = TYPE_COLORS[hotspot.type];
  const px = hotspot.x_frac * containerW;
  const py = hotspot.y_frac * containerH;
  // Display floor: a hotspot with 0-width or near-0 height (some PDF-import
  // paths can produce degenerate rects when the source annotation has no
  // area) still needs to be visible so the user can find and fix it. We
  // clamp the ON-SCREEN size to at least 12px each axis without touching
  // the stored fractions — resize/drag handlers write back the real user
  // dimensions, which will then exceed the floor.
  const MIN_DISPLAY_PX = 12;
  const rawPw = hotspot.w_frac * containerW;
  const rawPh = hotspot.h_frac * containerH;
  const pw = Math.max(rawPw, MIN_DISPLAY_PX);
  const ph = Math.max(rawPh, MIN_DISPLAY_PX);
  const isDegenerate = rawPw < MIN_DISPLAY_PX || rawPh < MIN_DISPLAY_PX;
  const isPdfImport = hotspot.source === 'pdf_import';
  // Edited-imports (was_imported=true but source flipped to 'manual' by a
  // human edit) intentionally look identical to hand-drawn work on the
  // canvas — the sidebar 'Edited' chip is where that origin distinction
  // lives, so the canvas stays visually calm.

  // PDF-imported hotspots visually recede so hand-drawn work reads on top:
  // lighter fill, dashed border regardless of publish state, softer opacity.
  // Hand-drawn drafts still use dashed borders + 0.55 opacity to signal
  // "unpublished", so the two cues combine naturally.
  const isDraft = !hotspot.is_published;
  const dashed = isDraft || isPdfImport;
  const opacity = isPdfImport ? (isDraft ? 0.35 : 0.55) : (isDraft ? 0.55 : 1);

  // z_index in the DOM: this MUST stay well below the Configure-hotspot modal
  // wrapper (`z-50` = 50). A prior version added +1000 when selected which
  // let the selected box punch through the modal backdrop, making it look
  // like the popup had a transparent hole and letting clicks fall through to
  // the hotspot underneath. Now we compress stored z into a small range and
  // apply a bounded lift so the whole hotspot layer stays under z=40.
  // Ties broken by id are already reflected in map order.
  const compressedZ = Math.min(hotspot.z_index ?? 0, 20);
  const domZ = 10 + compressedZ + (selected ? 5 : 0);

  // Selected label positioning: normally above the box, but if the box is
  // near the top of the page we flip it below so it isn't clipped.
  const labelBelow = py < 32;

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
        onSelect(e.altKey || e.metaKey);
      }}
      style={{
        // Degenerate boxes get a solid saturated fill so they read as
        // "needs attention" instead of vanishing.
        background: isDegenerate ? colors.stroke : colors.fill,
        border: `2px ${dashed ? 'dashed' : 'solid'} ${colors.stroke}`,
        outline: selected ? '2px solid black' : 'none',
        outlineOffset: 1,
        opacity: isDegenerate ? 0.9 : opacity,
        cursor: 'move',
        zIndex: domZ,
        // PDF-imported hotspots that aren't currently selected let clicks
        // pass through their fill to whatever is beneath — which is either
        // a manual hotspot (higher intent) or the page image. The number
        // pin (rendered below with `pointer-events: auto`) is still
        // clickable so the import itself can be selected. Once selected,
        // pointerEvents flips to 'auto' so drag/resize handles work.
        pointerEvents: (isPdfImport && !selected) ? 'none' : 'auto',
      }}
      className="group/hotspot"
    >
      {/* Numbered pin badge — always visible, tiny, matches sidebar row. */}
      <div
        // The pin badge stays clickable even when its parent has
        // pointer-events: none (for pdf_import unselected hotspots) — this
        // is how the user can still adopt an imported hotspot despite the
        // fill being click-through.
        className="absolute -top-2 -left-2 flex items-center gap-0.5"
        style={{ pointerEvents: 'auto', zIndex: 2 }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(e.altKey || e.metaKey);
        }}
      >
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold text-white rounded-full shadow-sm ring-1 ring-white"
          style={{ background: colors.stroke }}
        >
          {number}
        </span>
        {isPdfImport && (
          <span className="inline-flex items-center h-[16px] px-1 text-[9px] font-semibold text-gray-700 bg-white/95 border border-gray-300 rounded-sm shadow-sm">
            PDF
          </span>
        )}
      </div>

      {/* Floating label chip — shown when selected (always) or hovered
          (transient). Positioned above the box, or below if the box is near
          the top of the page. Never overflows the pin because it's absolutely
          positioned relative to the Rnd container. */}
      <div
        className={`absolute left-0 flex items-center gap-1 text-[10px] font-medium whitespace-nowrap pointer-events-none transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover/hotspot:opacity-100'
        } ${labelBelow ? '-bottom-6' : '-top-6'}`}
      >
        <span className={`px-1.5 py-0.5 bg-white/95 border border-gray-300 rounded shadow-sm ${colors.text}`}>
          <span className="font-semibold">#{number}</span> · {TYPE_LABELS[hotspot.type]}
          {hotspot.label ? ` · ${hotspot.label}` : ''}
        </span>
      </div>

      {/* Action buttons (only when selected). Anchored to the bottom-right
          of the box; if the box is short they still float below cleanly. */}
      {selected && (
        <div className="absolute -bottom-9 right-0 flex gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="px-2 py-1 text-xs font-medium bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            className="px-2 py-1 text-xs font-medium bg-white border border-red-300 text-red-700 rounded-md shadow-sm hover:bg-red-50"
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
      <div className="bg-white rounded-md shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
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
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 whitespace-nowrap"
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
// ============================================================
// PDF link import confirmation dialog
// ============================================================
function ImportPdfLinksDialog({
  existingPdfImportCount, onConfirm, onCancel,
}: {
  existingPdfImportCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-md shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Extract all links</h2>
        <p className="text-sm text-gray-700 mb-4">
          Auto-populate hotspots from three sources: <strong>embedded PDF links</strong>, a <strong>text-layer scan</strong> for emails / phone numbers / plain URLs, and <strong>QR-code decode</strong> on the page images. Each finding becomes a draft hotspot you can review and publish.
        </p>
        {existingPdfImportCount > 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
            <strong>{existingPdfImportCount}</strong> existing PDF-imported hotspot{existingPdfImportCount === 1 ? '' : 's'} will be replaced. Manually-drawn hotspots are preserved.
          </p>
        )}
        <p className="text-xs text-gray-500 mb-4">
          PDFs with many links can take 30&ndash;60 seconds to process. The page may appear unresponsive during import.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-700 rounded-md hover:bg-purple-800 whitespace-nowrap"
          >
            Extract now
          </button>
        </div>
      </div>
    </div>
  );
}

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
      <div className="bg-white rounded-md shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Copy hotspots from previous issue</h2>
        <p className="text-sm text-gray-700 mb-4">
          Hotspots from the selected issue will be <strong>added to this magazine</strong>{' '}
          as drafts. {existingCount > 0 && <>You already have {existingCount} hotspot{existingCount === 1 ? '' : 's'} here; the copies are added on top.</>}
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Source issue</label>
        <select
          value={sourceId ?? ''}
          onChange={(e) => setSourceId(Number(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md mb-4"
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
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => sourceId !== null && onConfirm(sourceId, publishedOnly)}
            disabled={sourceId === null}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-40"
          >
            Copy hotspots
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Right-side "Hotspots on this spread" panel.
// Lists every hotspot on the visible page(s), grouped by advertiser.
// Clicking a row selects the hotspot; the toolbar / z-lift handles the rest.
// ============================================================
function SpreadSidebar({
  hotspots,
  spreadNumberById,
  selectedId,
  onSelect,
  onEdit,
  onMoveZ,
}: {
  hotspots: Hotspot[];
  spreadNumberById: Map<number, number>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onEdit: (h: Hotspot) => void;
  onMoveZ: (id: number, move: ZMove) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Sort by (page_idx, z_index desc, id) so the topmost of each stack shows
  // first — that's how designers think about layers ("the top one is what a
  // reader clicks by default"). Numbering in spreadNumberById uses the same
  // sort order so canvas pins line up with sidebar rows.
  const sorted = useMemo(() => [...hotspots].sort((a, b) => {
    if (a.page_idx !== b.page_idx) return a.page_idx - b.page_idx;
    const az = a.z_index ?? 0;
    const bz = b.z_index ?? 0;
    if (az !== bz) return bz - az;
    return a.id - b.id;
  }), [hotspots]);

  // Split hand-drawn vs PDF-imported so the header can show the ratio.
  const importedCount = useMemo(
    () => sorted.filter((h) => h.source === 'pdf_import').length,
    [sorted],
  );
  const yoursCount = sorted.length - importedCount;

  // Group by advertiser_name (or "Unassigned"). Preserves inner order.
  const groups = useMemo(() => {
    const acc = new Map<string, Hotspot[]>();
    for (const h of sorted) {
      const key = (h.advertiser_name && h.advertiser_name.trim()) || 'Unassigned';
      const arr = acc.get(key) ?? [];
      arr.push(h);
      acc.set(key, arr);
    }
    return Array.from(acc.entries());
  }, [sorted]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="sticky top-24 shrink-0 px-2 py-2 text-xs bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
        aria-label="Show hotspots list"
      >
        ▶ Hotspots
      </button>
    );
  }

  return (
    <aside className="w-72 shrink-0 sticky top-24 bg-white border border-gray-200 rounded-md shadow-sm">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          Hotspots on this spread
          <span className="ml-1 normal-case tracking-normal font-normal text-gray-500">
            ({sorted.length}
            {importedCount > 0 && (
              <> · {yoursCount} yours · {importedCount} imported</>
            )})
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-gray-700 text-xs"
          aria-label="Collapse hotspots list"
        >
          ◀
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
        {groups.length === 0 && (
          <p className="px-3 py-4 text-xs text-gray-500 italic">
            No hotspots on this spread. Click &ldquo;Add hotspot&rdquo; below a page to draw one.
          </p>
        )}
        {groups.map(([advName, hs]) => (
          <div key={advName}>
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500 font-medium bg-gray-50">
              {advName}
            </div>
            {hs.map((h) => (
              <SidebarRow
                key={h.id}
                hotspot={h}
                number={spreadNumberById.get(h.id) ?? 0}
                selected={selectedId === h.id}
                onSelect={() => onSelect(h.id)}
                onEdit={() => onEdit(h)}
                onMoveZ={(move) => onMoveZ(h.id, move)}
              />
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

function SidebarRow({
  hotspot, number, selected, onSelect, onEdit, onMoveZ,
}: {
  hotspot: Hotspot;
  number: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onMoveZ: (move: ZMove) => void;
}) {
  const colors = TYPE_COLORS[hotspot.type];
  const isPdfImport = hotspot.source === 'pdf_import';
  // was_imported stays true forever once the extractor produced this row.
  // When source is no longer 'pdf_import', that means a human has edited
  // it — flag it as an edited-import so it can't be mistaken for a totally
  // hand-drawn hotspot, and so the user knows their edits are locked in
  // against future Extract-all runs.
  const isEditedImport = hotspot.was_imported === true && !isPdfImport;
  // Logo-match rows carry the label prefix "Logo · " from the extractor.
  // They're auto-published — which means clicks route immediately — so
  // we flag them prominently for admin review to catch any misroute.
  const isLogoMatch = isPdfImport && (hotspot.label ?? '').startsWith('Logo · ');
  return (
    <div
      className={`px-3 py-2 text-xs flex items-start gap-2 cursor-pointer hover:bg-gray-50 ${selected ? 'bg-blue-50' : ''}`}
      onClick={onSelect}
    >
      {/* Numbered chip — matches the pin on the canvas box. */}
      <span
        className="mt-0.5 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[11px] font-semibold text-white rounded-full shrink-0 ring-1 ring-white"
        style={{ background: colors.stroke }}
        aria-hidden
      >
        {number}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 justify-between">
          <span className={`font-medium ${colors.text} truncate flex items-center gap-1`} title={hotspot.label ?? undefined}>
            <span aria-hidden>{TYPE_ICONS[hotspot.type]}</span>
            {isLogoMatch && (
              <span
                className="px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide bg-purple-600 text-white rounded shrink-0"
                title="Auto-published from logo detection — verify it points to the right advertiser"
              >
                Review
              </span>
            )}
            {isEditedImport && (
              <span
                className="px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide bg-emerald-600 text-white rounded shrink-0"
                title="Extracted from the PDF and hand-edited — safe from future Extract-all runs"
              >
                Edited
              </span>
            )}
            <span className="truncate">
              {hotspot.label || <span className="italic text-gray-500">Unlabeled</span>}
            </span>
          </span>
          <span className="text-[10px] text-gray-400 shrink-0">
            p{hotspot.page_idx + 1}
            {isPdfImport && ' · PDF'}
            {isEditedImport && ' · edited'}
            {!hotspot.is_published && ' · draft'}
          </span>
        </div>
        {selected && (
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="px-1.5 py-0.5 text-[10px] border border-gray-300 rounded hover:bg-white"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveZ('forward'); }}
              className="px-1.5 py-0.5 text-[10px] border border-gray-300 rounded hover:bg-white"
              title="Bring forward"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveZ('backward'); }}
              className="px-1.5 py-0.5 text-[10px] border border-gray-300 rounded hover:bg-white"
              title="Send backward"
            >
              ↓
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
