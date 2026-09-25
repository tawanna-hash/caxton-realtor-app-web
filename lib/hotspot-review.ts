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
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, '')}${u.search}${u.hash}`;
  } catch { return target.trim(); }
}

export function samePlacement(a: Rect & { page_idx: number }, b: Rect & { page_idx: number }): boolean {
  return a.page_idx === b.page_idx && overlapRatio(a, b) >= 0.55;
}
