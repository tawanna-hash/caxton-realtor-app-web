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
