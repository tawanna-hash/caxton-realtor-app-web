// In-memory cache for the Marketing Performance rollup. Building it fans out
// to PostHog, Postgres and email stats and takes ~7s cold. Fresh for 15 min;
// after that the stale copy is served immediately (up to 6 h) while a refresh
// runs in the background. Spend edits clear it so they show up right away.

import type { buildMarketingPerformance } from './marketing-performance';

type Data = Awaited<ReturnType<typeof buildMarketingPerformance>>;
type Entry = { data: Data; at: number; refreshingAt?: number };

export const FRESH_MS = 15 * 60 * 1000;
export const STALE_MS = 6 * 60 * 60 * 1000;

const store = new Map<string, Entry>();

export function getCached(key: string): { data: Data; ageMs: number } | null {
  const e = store.get(key);
  if (!e) return null;
  const ageMs = Date.now() - e.at;
  if (ageMs > STALE_MS) return null;
  return { data: e.data, ageMs };
}

export function putCached(key: string, data: Data): void {
  store.set(key, { data, at: Date.now() });
}

export function clearMarketingPerformanceCache(): void {
  store.clear();
}

/** Returns true if the caller should start a refresh (and marks one in flight). */
export function claimRefresh(key: string): boolean {
  const e = store.get(key);
  if (!e) return false;
  // A claim expires after 2 min so a failed or degraded refresh can be retried.
  if (e.refreshingAt && Date.now() - e.refreshingAt < 2 * 60 * 1000) return false;
  e.refreshingAt = Date.now();
  return true;
}
