'use client';

// Client-side flag for the private Dallas/Ft. Worth preview.
//
// /api/market-preview sets the `caxton_dallas_preview=1` cookie only for
// accounts on the server allowlist (lib/server/dallas-preview) and clears it
// for everyone else. The cookie only controls what the app *shows* (market
// switcher entries, Dallas home). Dallas data endpoints still verify the
// signed-in account on the server.

import { useSyncExternalStore } from 'react';
import { getApiBase } from './api-base';

export const DALLAS_PREVIEW_COOKIE = 'caxton_dallas_preview';
export const MARKET_PREVIEW_EVENT = 'marketPreviewChange';

export function hasDallasPreviewClient(): boolean {
  if (typeof document === 'undefined') return false;
  return new RegExp(`(?:^|;\\s*)${DALLAS_PREVIEW_COOKIE}=1(?:;|$)`).test(document.cookie);
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(MARKET_PREVIEW_EVENT, cb);
  return () => window.removeEventListener(MARKET_PREVIEW_EVENT, cb);
}

/** True when the signed-in account may preview Dallas/Ft. Worth. */
export function useDallasPreview(): boolean {
  return useSyncExternalStore(subscribe, hasDallasPreviewClient, () => false);
}

/** Ask the server whether this account may preview Dallas; refresh the cookie. */
export async function refreshDallasPreview(): Promise<boolean> {
  const before = hasDallasPreviewClient();
  let allowed = false;
  try {
    const r = await fetch(`${getApiBase()}/market-preview`, { credentials: 'include', cache: 'no-store' });
    if (r.ok) allowed = !!((await r.json()) as { dallas?: boolean }).dallas;
  } catch {
    return before;
  }
  if (allowed !== before || allowed !== hasDallasPreviewClient()) {
    try {
      window.dispatchEvent(new Event(MARKET_PREVIEW_EVENT));
    } catch {}
  }
  return allowed;
}
