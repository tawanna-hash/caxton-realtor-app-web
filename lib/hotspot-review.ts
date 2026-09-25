import type { Hotspot, HotspotConfig } from './hotspots';

type Rect = Pick<Hotspot, 'x_frac' | 'y_frac' | 'w_frac' | 'h_frac'>;

/** Intersection over union, not containment: a full-ad link isn't a duplicate of its phone. */
export function overlapRatio(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.x_frac + a.w_frac, b.x_frac + b.w_frac) - Math.max(a.x_frac, b.x_frac));
  const h = Math.max(0, Math.min(a.y_frac + a.h_frac, b.y_frac + b.h_frac) - Math.max(a.y_frac, b.y_frac));
  const intersection = w * h;
  return intersection / Math.max(0.000001, a.w_frac * a.h_frac + b.w_frac * b.h_frac - intersection);
}

export function hotspotDestination(config: HotspotConfig): string {
  switch (config.type) {
    case 'link': case 'mls': return config.url?.trim() || '';
    case 'email': {
      if (!config.address?.trim()) return '';
      const params = new URLSearchParams();
      if (config.subject) params.set('subject', config.subject);
      if (config.body) params.set('body', config.body);
      return `mailto:${encodeURIComponent(config.address.trim())}${params.size ? `?${params.toString()}` : ''}`;
    }
    case 'phone': return config.number?.trim() ? `tel:${config.number.replace(/[^\d+]/g, '')}` : '';
    case 'video': case 'audio': return (config.source === 'upload' ? config.upload_url : config.embed_url) || '';
    case 'image': return config.images?.[0]?.url || '';
    case 'reveal': return config.media_url || '';
    case 'form': return '';
  }
}

export function safeTestDestination(config: HotspotConfig): string | null {
  const target = hotspotDestination(config);
  if (/^(mailto:|tel:)/i.test(target)) return target;
  try {
    const url = new URL(target);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function reviewProblem(h: Pick<Hotspot, 'config' | 'type' | 'advertiser_id' | 'detection'>): string | null {
  if (h.config.type !== h.type) return 'Action and destination type do not match';
  if (h.type === 'form' && h.config.type === 'form') return h.config.fields?.length ? null : 'Add form fields';
  if (!safeTestDestination(h.config)) return 'Add a valid destination';
  if (h.config.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.config.address)) return 'Check the email address';
  if (h.config.type === 'phone' && h.config.number.replace(/\D/g, '').length < 7) return 'Check the phone number';
  if (h.config.type === 'link' && /^https?:\/\/(www\.)?example\.com(?:\/|$)/i.test(h.config.url)) return 'Replace the placeholder URL';
  // A human may deliberately route an unmatched logo to a verified URL without a CRM partner.
  return null;
}

export function reviewStatus(h: Hotspot): 'pending' | 'approved' | 'rejected' {
  return h.review_status || (h.is_published ? 'approved' : 'pending');
}

export function destinationIdentity(config: HotspotConfig): string {
  if (config.type === 'phone') return config.number.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (config.type === 'email') return config.address.trim().toLowerCase();
  const target = hotspotDestination(config);
  try {
    const u = new URL(target);
    // Paths and query strings are case-sensitive. Do not lower-case them.
    // Tracking variants and www do not make a second reader destination.
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(gclid|fbclid|msclkid)$/i.test(key)) u.searchParams.delete(key);
    }
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.port ? `:${u.port}` : ''}${u.pathname.replace(/\/$/, '')}${u.search}${u.hash}`;
  } catch { return target.trim(); }
}

export function samePlacement(a: Rect & { page_idx: number }, b: Rect & { page_idx: number }): boolean {
  if (a.page_idx !== b.page_idx) return false;
  if (overlapRatio(a, b) >= 0.55) return true;
  const w = Math.max(0, Math.min(a.x_frac + a.w_frac, b.x_frac + b.w_frac) - Math.max(a.x_frac, b.x_frac));
  const h = Math.max(0, Math.min(a.y_frac + a.h_frac, b.y_frac + b.h_frac) - Math.max(a.y_frac, b.y_frac));
  // OCR often boxes just the letters inside a larger embedded PDF link.
  // Callers must also compare destinations; containment alone is not a duplicate.
  return w * h / Math.max(0.000001, Math.min(a.w_frac * a.h_frac, b.w_frac * b.h_frac)) >= 0.8;
}

type DetectedAction = Rect & {
  page_idx: number;
  type: string;
  config: Record<string, unknown> | HotspotConfig;
  advertiser_id?: number | null;
  label?: string | null;
  identity?: string;
  detection?: { identity?: string; origin?: string } | null;
};

export function occurrenceCoverage(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x_frac + a.w_frac, b.x_frac + b.w_frac) - Math.max(a.x_frac, b.x_frac));
  const y = Math.max(0, Math.min(a.y_frac + a.h_frac, b.y_frac + b.h_frac) - Math.max(a.y_frac, b.y_frac));
  return x * y / Math.max(0.000001, Math.min(a.w_frac * a.h_frac, b.w_frac * b.h_frac));
}

/** Logo and partner-name boxes can be nested or slightly offset on the same mark.
 * Require a shared known partner or a matching nonempty name; empty URLs alone
 * never establish identity. Separate occurrences of the same brand stay separate.
 */
export function sameDetectedAction(a: DetectedAction, b: DetectedAction): boolean {
  if (a.page_idx !== b.page_idx || a.type !== b.type) return false;
  const aTarget = destinationIdentity(a.config as HotspotConfig);
  const bTarget = destinationIdentity(b.config as HotspotConfig);
  if (aTarget && bTarget && aTarget === bTarget && occurrenceCoverage(a, b) >= 0.5) return true;
  if (aTarget && bTarget && aTarget !== bTarget) return false;
  const aKey = a.identity || a.detection?.identity || '';
  const bKey = b.identity || b.detection?.identity || '';
  const brandKey = (key: string, label?: string | null) => {
    const value = /^(?:logo|partner):(.+)$/i.exec(key)?.[1] ||
      /^(?:Logo|Partner) · (.+)$/i.exec(label || '')?.[1] || '';
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  };
  const aBrand = brandKey(aKey, a.label), bBrand = brandKey(bKey, b.label);
  const sharedBrand = (!!a.advertiser_id && a.advertiser_id === b.advertiser_id) ||
    (!!aBrand && !!bBrand && (aBrand === bBrand ||
      (Math.min(aBrand.length, bBrand.length) >= 5 &&
        (aBrand.includes(bBrand) || bBrand.includes(aBrand)))));
  if (!sharedBrand) return false;
  return occurrenceCoverage(a, b) >= 0.5;
}

/** Never remove different destinations or non-overlapping placements. */
export function overlappingDuplicates(rows: Hotspot[]): Hotspot[] {
  const kept: Hotspot[] = [], duplicates: Hotspot[] = [];
  const ranked = rows.filter(h => !h.is_deleted && reviewStatus(h) !== 'rejected').sort((a, b) =>
    Number(b.is_published) - Number(a.is_published) ||
    Number(b.source === 'manual') - Number(a.source === 'manual') ||
    Number(!!hotspotDestination(b.config)) - Number(!!hotspotDestination(a.config)) ||
    Number(!!b.label?.replace(/^(?:Logo|Partner) ·\s*/i, '').trim()) -
      Number(!!a.label?.replace(/^(?:Logo|Partner) ·\s*/i, '').trim()) ||
    Number(a.id) - Number(b.id));
  for (const row of ranked) {
    if (kept.some(h => sameDetectedAction(h, row))) duplicates.push(row);
    else kept.push(row);
  }
  return duplicates;
}
