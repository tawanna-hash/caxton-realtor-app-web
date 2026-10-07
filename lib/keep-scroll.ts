'use client';

import { useEffect } from 'react';

const KEY = 'keep-scroll';

export type KeepScrollRecord = { path: string; y: number };

export function readKeepScroll(): KeepScrollRecord | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const rec = raw ? (JSON.parse(raw) as KeepScrollRecord) : null;
    return rec && rec.path === window.location.pathname && typeof rec.y === 'number' ? rec : null;
  } catch {
    return null;
  }
}

/**
 * Marks a page as one you are working on. While active, the scroll position is saved so a refresh
 * returns to the exact spot. Every other page still starts at the top after a refresh.
 * `enabled` lets a page wait until its state has loaded before it decides to save or clear.
 */
export function useKeepScroll(active: boolean, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const path = window.location.pathname;
    if (!active) {
      try {
        const raw = window.sessionStorage.getItem(KEY);
        if (raw && (JSON.parse(raw) as KeepScrollRecord).path === path) window.sessionStorage.removeItem(KEY);
      } catch { /* storage unavailable */ }
      return;
    }
    let timer: number | undefined;
    const save = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        try { window.sessionStorage.setItem(KEY, JSON.stringify({ path, y: Math.round(window.scrollY) })); } catch { /* storage unavailable */ }
      }, 150);
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.removeEventListener('scroll', save);
      if (timer) window.clearTimeout(timer);
    };
  }, [active, enabled]);
}
