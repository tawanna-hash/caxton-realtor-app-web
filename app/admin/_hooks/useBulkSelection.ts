// app/admin/_hooks/useBulkSelection.ts
//
// Shared selection state machine for admin tables. Solves three problems
// at once:
//
//   1. Toggling per-row checkboxes ("page mode") — a Set<string> of IDs.
//   2. Promoting selection to "every matching row across all pages"
//      ("filter mode") — the UI sends scope (segment + search + filter)
//      to the server and the server re-derives the row set. This avoids
//      shipping 5,000 UUIDs to the wire.
//   3. Auto-clearing selection when the underlying query changes, so
//      the user can't accidentally delete a different filter's rows.
//
// Hydration safety: the hook always returns the same shape on first
// render. Consumers that render bulk UI gated behind `mounted` get an
// SSR-stable shell.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type SelectionMode = 'none' | 'page' | 'filter';

export type BulkSelectionState = {
  mode: SelectionMode;
  /** Per-row IDs explicitly checked. Empty in 'filter' mode. */
  pageIds: Set<string>;
  /** Server-confirmed estimate when in 'filter' mode. */
  filterEstimate: number;
};

export type UseBulkSelectionOpts = {
  /**
   * A stable key that represents the current filter scope. When this
   * value changes, selection automatically resets to 'none'. Use
   * something like `${segment}|${query}|${filter}`.
   */
  scopeKey: string;
  /** Total rows that match the filter across all pages. Used by the
   *  "select all matching" promotion. */
  totalMatching: number;
  /** Page-mode selection is automatically dropped when offset changes
   *  unless this is set to false. Default true. */
  resetOnPageChange?: boolean;
  pageOffset?: number;
};

export type UseBulkSelectionReturn = {
  state: BulkSelectionState;
  /** True only after first client mount; gate bulk UI behind this to
   *  avoid hydration mismatch. */
  mounted: boolean;
  /** Toggle a single row checkbox. */
  toggleRow: (id: string, checked: boolean) => void;
  /** Header checkbox: select / clear every visible row. */
  setPageIds: (ids: string[], checked: boolean) => void;
  /** Promote page-mode to "every matching row" mode. */
  selectAllMatching: () => void;
  clear: () => void;
  /** True if every visible row is checked AND we're in page mode. */
  isPageFullySelected: (visibleIds: string[]) => boolean;
  /** Used to drive the header checkbox indeterminate state via a ref. */
  setIndeterminateRef: (el: HTMLInputElement | null) => void;
  /** Effective N for bulk-action labels: page-ids size or filter
   *  estimate. */
  effectiveCount: number;
};

const EMPTY = new Set<string>();

export function useBulkSelection(opts: UseBulkSelectionOpts): UseBulkSelectionReturn {
  const { scopeKey, totalMatching, resetOnPageChange = true, pageOffset = 0 } = opts;

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<SelectionMode>('none');
  const [pageIds, setPageIdsState] = useState<Set<string>>(EMPTY);
  const [filterEstimate, setFilterEstimate] = useState<number>(0);

  // Hydration-safe: only flip mounted after first client render.
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  // Reset whenever the scope (segment + search + filter) changes.
  const prevScope = useRef(scopeKey);
  useEffect(() => {
    if (prevScope.current !== scopeKey) {
      prevScope.current = scopeKey;
      queueMicrotask(() => {
        setMode('none');
        setPageIdsState(EMPTY);
        setFilterEstimate(0);
      });
    }
  }, [scopeKey]);

  // Drop page-mode selection when the user paginates. Filter mode
  // survives pagination because it's scope-defined.
  const prevOffset = useRef(pageOffset);
  useEffect(() => {
    if (!resetOnPageChange) { prevOffset.current = pageOffset; return; }
    if (prevOffset.current !== pageOffset) {
      prevOffset.current = pageOffset;
      if (mode === 'page') {
        queueMicrotask(() => {
          setMode('none');
          setPageIdsState(EMPTY);
        });
      }
    }
  }, [pageOffset, resetOnPageChange, mode]);

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setMode((m) => (m === 'filter' ? 'page' : m));
    setPageIdsState((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      if (next.size === 0) {
        // Defer mode flip — useEffect below would also catch this but
        // doing it here keeps the UI consistent within one render.
        return EMPTY;
      }
      return next;
    });
    if (mode === 'none' || mode === 'filter') {
      setMode(checked ? 'page' : 'none');
    }
  }, [mode]);

  // Whenever pageIds shrinks to 0, snap mode back to 'none'.
  useEffect(() => {
    if (mode === 'page' && pageIds.size === 0) queueMicrotask(() => setMode('none'));
  }, [mode, pageIds]);

  const setPageIds = useCallback((ids: string[], checked: boolean) => {
    if (checked && ids.length > 0) {
      setMode('page');
      setPageIdsState(new Set(ids));
    } else {
      setMode('none');
      setPageIdsState(EMPTY);
    }
  }, []);

  const selectAllMatching = useCallback(() => {
    if (totalMatching <= 0) return;
    setMode('filter');
    setPageIdsState(EMPTY);
    setFilterEstimate(totalMatching);
  }, [totalMatching]);

  const clear = useCallback(() => {
    setMode('none');
    setPageIdsState(EMPTY);
    setFilterEstimate(0);
  }, []);

  const isPageFullySelected = useCallback(
    (visibleIds: string[]) =>
      mode === 'page' && visibleIds.length > 0 && visibleIds.every((id) => pageIds.has(id)),
    [mode, pageIds],
  );

  const headerRef = useRef<HTMLInputElement | null>(null);
  const setIndeterminateRef = useCallback((el: HTMLInputElement | null) => {
    headerRef.current = el;
  }, []);

  // Sync indeterminate via ref (React doesn't expose it as a prop).
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const partial = mode === 'page' && pageIds.size > 0;
    // We don't know visibleIds in this scope; consumers can compute
    // exact "all checked" elsewhere and we just toggle the dash when
    // partial.
    el.indeterminate = partial && !el.checked;
  }, [mode, pageIds]);

  const effectiveCount = useMemo(() => {
    if (mode === 'filter') return filterEstimate;
    if (mode === 'page') return pageIds.size;
    return 0;
  }, [mode, pageIds, filterEstimate]);

  const state = useMemo<BulkSelectionState>(
    () => ({ mode, pageIds, filterEstimate }),
    [mode, pageIds, filterEstimate],
  );

  return {
    state,
    mounted,
    toggleRow,
    setPageIds,
    selectAllMatching,
    clear,
    isPageFullySelected,
    setIndeterminateRef,
    effectiveCount,
  };
}

/** Polls a background job until done|failed or aborted. */
export async function pollJob(
  jobId: string,
  onProgress: (p: { processed: number; total: number | null; status: string }) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<{ status: 'done' | 'failed'; processed: number; total: number | null; error?: string | null }> {
  const interval = opts.intervalMs ?? 1500;
  while (true) {
    if (opts.signal?.aborted) throw new Error('aborted');
    const res = await fetch(`/api/admin/jobs/${jobId}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`job poll failed: HTTP ${res.status}`);
    }
    const data = await res.json() as {
      status: string; processed: number; total: number | null; error?: string | null;
    };
    onProgress({ processed: data.processed, total: data.total, status: data.status });
    if (data.status === 'done' || data.status === 'failed') {
      return {
        status: data.status as 'done' | 'failed',
        processed: data.processed,
        total: data.total,
        error: data.error ?? null,
      };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
