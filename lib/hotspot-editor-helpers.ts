// lib/hotspot-editor-helpers.ts
//
// Helpers shared by the hotspot editor. Pure functions, no React.

import type { Hotspot, HotspotType, HotspotConfig } from './hotspots';

/**
 * Default config for each hotspot type. New hotspots start with these and
 * the user fills in the URL / file / etc. via the config modal.
 */
export function defaultConfigForType(type: HotspotType): HotspotConfig {
  switch (type) {
    case 'link':
      return { type: 'link', url: '', open_in: 'new_tab' };
    case 'mls':
      return { type: 'mls', url: '' };
    case 'phone':
      return { type: 'phone', number: '' };
    case 'email':
      return { type: 'email', address: '' };
    case 'video':
      return { type: 'video', source: 'embed', embed_url: '' };
    case 'audio':
      return { type: 'audio', source: 'embed', embed_url: '' };
    case 'image':
      return { type: 'image', images: [] };
    case 'form':
      return { type: 'form', fields: ['name', 'email'] };
    case 'reveal':
      return { type: 'reveal', media_url: '' };
  }
}

/**
 * Default rectangle to drop a new hotspot at when the user clicks
 * "Add hotspot" without drag-drawing. Centered on the page, 30% size.
 */
export const DEFAULT_NEW_RECT = {
  x_frac: 0.35, y_frac: 0.35, w_frac: 0.3, h_frac: 0.3,
};

/** Human-readable label for each type. */
export const TYPE_LABELS: Record<HotspotType, string> = {
  link: 'Link',
  video: 'Video',
  image: 'Image Gallery',
  phone: 'Phone Number',
  email: 'Email',
  form: 'Form',
  mls: 'MLS Listing',
  audio: 'Audio',
  reveal: 'Reveal',
};

/** Color tint for each type. Matches HotspotLayer.tsx so the editor and reader agree. */
export const TYPE_COLORS: Record<HotspotType, { fill: string; stroke: string; text: string }> = {
  link:   { fill: 'rgba(59, 130, 246, 0.20)', stroke: 'rgb(59, 130, 246)', text: 'text-blue-700' },
  video:  { fill: 'rgba(239, 68, 68, 0.20)',  stroke: 'rgb(239, 68, 68)',  text: 'text-red-700' },
  image:  { fill: 'rgba(168, 85, 247, 0.20)', stroke: 'rgb(168, 85, 247)', text: 'text-purple-700' },
  phone:  { fill: 'rgba(34, 197, 94, 0.20)',  stroke: 'rgb(34, 197, 94)',  text: 'text-green-700' },
  email:  { fill: 'rgba(245, 158, 11, 0.20)', stroke: 'rgb(245, 158, 11)', text: 'text-amber-700' },
  form:   { fill: 'rgba(20, 184, 166, 0.20)', stroke: 'rgb(20, 184, 166)', text: 'text-teal-700' },
  mls:    { fill: 'rgba(99, 102, 241, 0.20)', stroke: 'rgb(99, 102, 241)', text: 'text-indigo-700' },
  audio:  { fill: 'rgba(236, 72, 153, 0.20)', stroke: 'rgb(236, 72, 153)', text: 'text-pink-700' },
  reveal: { fill: 'rgba(251, 146, 60, 0.20)', stroke: 'rgb(251, 146, 60)', text: 'text-orange-700' },
};

/** Clamp a rectangle to fit inside [0,1] in both dimensions. */
export function clampRect(rect: { x_frac: number; y_frac: number; w_frac: number; h_frac: number }) {
  const minSize = 0.01; // 1% — too small is unusable
  const w = Math.max(minSize, Math.min(rect.w_frac, 1));
  const h = Math.max(minSize, Math.min(rect.h_frac, 1));
  const x = Math.max(0, Math.min(rect.x_frac, 1 - w));
  const y = Math.max(0, Math.min(rect.y_frac, 1 - h));
  return { x_frac: x, y_frac: y, w_frac: w, h_frac: h };
}

/** Format relative time for the save indicator. */
export function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/** Sort hotspots in a stable display order. */
export function sortHotspots(hotspots: Hotspot[]): Hotspot[] {
  return [...hotspots].sort((a, b) => {
    if (a.page_idx !== b.page_idx) return a.page_idx - b.page_idx;
    const az = a.z_index ?? 0;
    const bz = b.z_index ?? 0;
    if (az !== bz) return az - bz;
    return a.id - b.id;
  });
}

/**
 * Compute z-index moves for one hotspot on its page. Given the full page list
 * sorted by (z_index, id), returns the new z_index the moved hotspot should
 * get. Returns `null` if no change is needed (already at the requested edge).
 *
 * The rule: we don't try to normalize the whole page (that would require N
 * server writes). Instead we pick a single new z_index that lands the target
 * in the desired slot relative to the others on the page.
 *
 *   'front' : one higher than the current max on the page
 *   'back'  : one lower than the current min on the page
 *   'forward' : swap with the next-higher neighbor (returns that neighbor's z)
 *              — caller can also PATCH the neighbor to the target's old z
 *              to keep values dense, but a simple +/- works too.
 *   'backward': swap with the next-lower neighbor.
 *
 * For simplicity, forward/backward return an integer that guarantees the
 * hotspot lands just above/below the neighbor without a swap PATCH.
 */
export type ZMove = 'front' | 'back' | 'forward' | 'backward';

export function computeZMove(
  pageHotspots: Hotspot[],
  hotspotId: number,
  move: ZMove,
): number | null {
  const sorted = [...pageHotspots].sort((a, b) => {
    const az = a.z_index ?? 0;
    const bz = b.z_index ?? 0;
    if (az !== bz) return az - bz;
    return a.id - b.id;
  });
  const idx = sorted.findIndex((h) => h.id === hotspotId);
  if (idx < 0) return null;
  const cur = sorted[idx];
  const curZ = cur.z_index ?? 0;

  if (move === 'front') {
    const maxZ = sorted.reduce((m, h) => Math.max(m, h.z_index ?? 0), 0);
    if (idx === sorted.length - 1 && curZ >= maxZ) return null;
    return maxZ + 1;
  }
  if (move === 'back') {
    const minZ = sorted.reduce((m, h) => Math.min(m, h.z_index ?? 0), 0);
    if (idx === 0 && curZ <= minZ) return null;
    return minZ - 1;
  }
  if (move === 'forward') {
    if (idx >= sorted.length - 1) return null;
    const nextZ = sorted[idx + 1].z_index ?? 0;
    // Land just above the neighbor.
    return nextZ + 1;
  }
  // backward
  if (idx <= 0) return null;
  const prevZ = sorted[idx - 1].z_index ?? 0;
  return prevZ - 1;
}
