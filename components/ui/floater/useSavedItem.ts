'use client';

// components/ui/floater/useSavedItem.ts
//
// Client-side "saved" items (favorites) backed by localStorage. No backend —
// this is the pragmatic first cut: a home/bookmark the user can pin from any
// detail-page floater. The store is a single map keyed by a stable
// `${surface}:${id}` so an inventory listing, a community, and a builder can
// all be saved without colliding.
//
// Implemented with useSyncExternalStore: localStorage is an external store, so
// we subscribe to it (plus the cross-tab `storage` event) and cache the
// parsed map so getSnapshot returns a stable reference between writes. This
// avoids setState-in-effect and keeps every mounted floater in sync for free.

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'rnn:saved-items';

export type SavedItem = {
  id: string;
  title: string;
  url: string;
  surface: string;
  ts: number;
};

type SavedMap = Record<string, SavedItem>;

const EMPTY: SavedMap = {};

// --- external store ---
const listeners = new Set<() => void>();

function emitChange(): void {
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) emitChange();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

// --- cached parse so getSnapshot is referentially stable between writes ---
let cachedRaw: string | null | undefined = undefined;
let cachedMap: SavedMap = EMPTY;

function readMap(): SavedMap {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedMap;
    cachedRaw = raw;
    cachedMap = raw ? (JSON.parse(raw) as SavedMap) : EMPTY;
    return cachedMap;
  } catch {
    return cachedMap;
  }
}

function writeMap(m: SavedMap): void {
  if (typeof window === 'undefined') return;
  cachedMap = m;
  try {
    cachedRaw = JSON.stringify(m);
    window.localStorage.setItem(KEY, cachedRaw);
  } catch {
    // Quota / privacy mode — swallow. Saved items are a nice-to-have.
  }
  emitChange();
}

function getSnapshot(): SavedMap {
  return readMap();
}

function getServerSnapshot(): SavedMap {
  return EMPTY;
}

/**
 * Subscribe to one item's saved state. Pass a stable `id` (or null/undefined
 * to disable Save entirely). `meta` is captured when the item is first saved.
 */
export function useSavedItem(
  id: string | null | undefined,
  meta: { title: string; url: string; surface: string },
) {
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const saved = id ? !!map[id] : false;

  const toggle = useCallback((): boolean => {
    if (!id) return false;
    const m: SavedMap = { ...readMap() };
    let nowSaved: boolean;
    if (m[id]) {
      delete m[id];
      nowSaved = false;
    } else {
      m[id] = {
        id,
        title: meta.title,
        url: meta.url,
        surface: meta.surface,
        ts: Date.now(),
      };
      nowSaved = true;
    }
    writeMap(m);
    return nowSaved;
  }, [id, meta.title, meta.url, meta.surface]);

  return { saved, toggle };
}
