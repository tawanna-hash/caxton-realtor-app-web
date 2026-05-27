// lib/hotspots.ts
//
// Hotspot data model and types. Schema is created by ensureSchema() in lib/db.ts
// alongside the rest of the app's tables — no separate migration step needed.
//
// Hotspots are clickable rectangular regions overlaid on magazine pages.
// Position is stored as fractions of natural page dimensions (0..1), so the
// same hotspot renders correctly at any zoom level, in either reader, and on
// any device. Click tracking goes to magazine_hotspot_clicks for advertiser
// performance reports (Phase 4).

export type HotspotType =
  | 'link'
  | 'video'
  | 'image'
  | 'phone'
  | 'email'
  | 'form'
  | 'mls'
  | 'audio'
  | 'reveal';

// Per-type config shapes. Stored as JSONB. The discriminated union keeps the
// type-checker honest when we render or edit a hotspot.
export type HotspotConfig =
  | { type: 'link'; url: string; open_in?: 'new_tab' | 'same_tab' }
  | { type: 'video'; source: 'upload' | 'embed'; upload_url?: string; embed_url?: string; autoplay?: boolean; poster_url?: string }
  | { type: 'image'; images: Array<{ url: string; caption?: string }> }
  | { type: 'phone'; number: string; label?: string }
  | { type: 'email'; address: string; subject?: string; body?: string }
  | { type: 'form'; form_id?: string; fields: string[] }
  | { type: 'mls'; url: string; address?: string; price?: string }
  | { type: 'audio'; source: 'upload' | 'embed'; upload_url?: string; embed_url?: string; title?: string }
  | { type: 'reveal'; media_url: string; caption?: string; animation?: 'fade' | 'slide' | 'scale' };

/** Row shape as stored / returned. Position fields use fractions (0..1). */
export interface Hotspot {
  id: number;
  magazine_id: number;
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
  type: HotspotType;
  config: HotspotConfig;
  label: string | null;
  advertiser_name: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** Lighter shape returned to the public reader. No admin / tracking metadata. */
export interface PublicHotspot {
  id: number;
  page_idx: number;
  x: number;  // x_frac
  y: number;
  w: number;
  h: number;
  type: HotspotType;
  label: string | null;
  config: HotspotConfig;
}

/** Map a DB row to the public shape. */
export function toPublicHotspot(row: Hotspot): PublicHotspot {
  return {
    id: row.id,
    page_idx: row.page_idx,
    x: row.x_frac,
    y: row.y_frac,
    w: row.w_frac,
    h: row.h_frac,
    type: row.type,
    label: row.label,
    config: row.config,
  };
}

/** Validate that an arbitrary value is a valid HotspotType. */
export function isHotspotType(s: unknown): s is HotspotType {
  return typeof s === 'string' && [
    'link', 'video', 'image', 'phone', 'email',
    'form', 'mls', 'audio', 'reveal',
  ].includes(s);
}

/** Validate that fractions are in [0, 1] and rect has positive size. */
export function validatePosition(
  x: unknown, y: unknown, w: unknown, h: unknown,
): { ok: true; values: { x: number; y: number; w: number; h: number } } | { ok: false; error: string } {
  const nums = [x, y, w, h];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ok: false, error: 'x, y, w, h must be finite numbers' };
  }
  const [nx, ny, nw, nh] = nums as number[];
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
    return { ok: false, error: 'x and y must be in [0, 1]' };
  }
  if (nw <= 0 || nw > 1 || nh <= 0 || nh > 1) {
    return { ok: false, error: 'w and h must be in (0, 1]' };
  }
  if (nx + nw > 1.001 || ny + nh > 1.001) {
    return { ok: false, error: 'hotspot extends outside the page' };
  }
  return { ok: true, values: { x: nx, y: ny, w: nw, h: nh } };
}

/**
 * Validate that a config payload matches its declared type. Doesn't deep-
 * validate URLs (those can be anything advertisers paste in), just shape.
 */
export function validateConfig(type: HotspotType, config: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof config !== 'object' || config === null) {
    return { ok: false, error: 'config must be an object' };
  }
  const c = config as Record<string, unknown>;
  switch (type) {
    case 'link':
    case 'mls':
      if (typeof c.url !== 'string' || !c.url.trim()) return { ok: false, error: `${type} requires url` };
      return { ok: true };
    case 'video':
    case 'audio': {
      if (c.source !== 'upload' && c.source !== 'embed') {
        return { ok: false, error: `${type} requires source: 'upload' | 'embed'` };
      }
      if (c.source === 'upload' && (typeof c.upload_url !== 'string' || !c.upload_url.trim())) {
        return { ok: false, error: `${type} upload requires upload_url` };
      }
      if (c.source === 'embed' && (typeof c.embed_url !== 'string' || !c.embed_url.trim())) {
        return { ok: false, error: `${type} embed requires embed_url` };
      }
      return { ok: true };
    }
    case 'image':
      if (!Array.isArray(c.images) || c.images.length === 0) {
        return { ok: false, error: 'image requires non-empty images array' };
      }
      return { ok: true };
    case 'phone':
      if (typeof c.number !== 'string' || !c.number.trim()) return { ok: false, error: 'phone requires number' };
      return { ok: true };
    case 'email':
      if (typeof c.address !== 'string' || !c.address.trim()) return { ok: false, error: 'email requires address' };
      return { ok: true };
    case 'form':
      if (!Array.isArray(c.fields) || c.fields.length === 0) {
        return { ok: false, error: 'form requires non-empty fields array' };
      }
      return { ok: true };
    case 'reveal':
      if (typeof c.media_url !== 'string' || !c.media_url.trim()) {
        return { ok: false, error: 'reveal requires media_url' };
      }
      return { ok: true };
  }
}
