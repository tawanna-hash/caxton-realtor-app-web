'use client';

// components/inventory/EditInventoryModal.tsx
//
// Modal wrapper that opens the existing AdminInventoryDetail editor in a
// popup, so admins can edit listings/promotions without leaving the queue.
// Fetches the full row on open (the queue gives us a lightweight row, but
// the detail editor needs the complete record from getBuilderInventoryById).

import { useEffect, useReducer } from 'react';
import type { BuilderInventoryRow } from '@/lib/builder-inventory';
import AdminInventoryDetail from './AdminInventoryDetail';

type Props = {
  /** The id of the inventory row to edit. When null, the modal is closed. */
  id: number | null;
  /** Called when the user closes the modal (X, backdrop, Escape). */
  onClose: () => void;
  /** Called after any successful mutation so the parent list can refresh. */
  onChanged?: () => void;
};

type FetchState =
  | { status: 'loading' }
  | { status: 'ready'; row: BuilderInventoryRow }
  | { status: 'error'; message: string };

type FetchAction =
  | { type: 'loaded'; row: BuilderInventoryRow }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case 'loaded':
      return { status: 'ready', row: action.row };
    case 'failed':
      return { status: 'error', message: action.message };
    case 'reset':
      return { status: 'loading' };
  }
}

export default function EditInventoryModal({ id, onClose, onChanged }: Props) {
  const [state, dispatch] = useReducer(fetchReducer, { status: 'loading' });

  // Lock body scroll while the modal is open and wire up Escape-to-close.
  useEffect(() => {
    if (id == null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [id, onClose]);

  // Fetch the full row whenever a new id is opened.
  useEffect(() => {
    if (id == null) return;
    let cancelled = false;
    dispatch({ type: 'reset' });
    (async () => {
      try {
        const res = await fetch(`/api/admin/inventory/${id}`, {
          credentials: 'include',
        });
        let fetchedRow: BuilderInventoryRow | null = null;
        if (!res.ok) {
          // Fallback: the GET single-row endpoint may not exist on older
          // deploys. Pull it from the list endpoint instead.
          const listRes = await fetch(`/api/admin/inventory?status=any`, {
            credentials: 'include',
          });
          if (!listRes.ok) throw new Error(`HTTP ${res.status}`);
          const listBody = (await listRes.json()) as {
            rows: BuilderInventoryRow[];
          };
          const match = listBody.rows.find((r) => r.id === id);
          if (!match) throw new Error('Submission not found');
          fetchedRow = match;
        } else {
          const body = (await res.json()) as
            | { row: BuilderInventoryRow }
            | BuilderInventoryRow;
          fetchedRow = 'row' in body ? body.row : body;
        }
        if (cancelled || !fetchedRow) return;
        dispatch({ type: 'loaded', row: fetchedRow });
      } catch (e) {
        if (cancelled) return;
        dispatch({
          type: 'failed',
          message: e instanceof Error ? e.message : 'Failed to load',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (id == null) return null;

  const row = state.status === 'ready' ? state.row : null;
  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.message : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-2 py-6 sm:px-4 sm:py-10 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit submission"
    >
      <div
        className="relative bg-white rounded-md shadow-xl w-full max-w-6xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white rounded-t-md">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
              Admin · Edit submission
            </p>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
              {row ? `${row.builderName} — ${row.title}` : 'Loading…'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 ml-4 w-9 h-9 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5">
          {loading && (
            <p className="text-sm text-gray-500 font-light py-10 text-center">
              Loading submission…
            </p>
          )}
          {error && !loading && (
            <div
              role="alert"
              className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              {error}
            </div>
          )}
          {row && !loading && (
            <AdminInventoryDetail
              row={row}
              variant="modal"
              onClose={onClose}
              onChanged={onChanged}
            />
          )}
        </div>
      </div>
    </div>
  );
}
