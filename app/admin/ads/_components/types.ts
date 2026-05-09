// caxton-ads-v1
// Shared TypeScript types for the /admin/ads UI.
// Mirrors what the droplet returns from /admin/ads/* endpoints.

export type AdZone = 'article' | 'feed' | 'calendar' | 'newsletter' | 'app' | 'account' | 'misc';
export type AdTier = 'premium' | 'standard' | 'house';
export type AdPublication = 'austin' | 'san_antonio' | 'both';

export interface AdSize {
  w: number;
  h: number;
  context: string;
}

export interface AdSpace {
  slug: string;
  display_name: string;
  zone: AdZone;
  tier: AdTier;
  sizes_json: AdSize[];
  notes: string | null;
}

export interface AdCreative {
  id: string;
  advertiser_name: string;
  blob_url: string;
  width: number | null;
  height: number | null;
  click_url: string;
  alt_text: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface AdCampaign {
  id: string;
  advertiser_name: string;
  ad_space_slug: string;
  creative_id: string;
  publication: AdPublication;
  start_date: string;
  end_date: string;
  active: boolean;
  price_total: string | null; // numeric comes back as string from pg
  price_notes: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  ad_space: AdSpace;
  creative: AdCreative;
}

export const PUBLICATION_LABELS: Record<AdPublication, string> = {
  austin: 'RealtyLine (Austin)',
  san_antonio: 'Newsline (SA)',
  both: 'Both publications',
};

export const ZONE_LABELS: Record<AdZone, string> = {
  article: 'Article',
  feed: 'Feed',
  calendar: 'Calendar',
  newsletter: 'Newsletter',
  app: 'App-level',
  account: 'Account',
  misc: 'Misc',
};

export const TIER_COLORS: Record<AdTier, string> = {
  premium: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  standard: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  house: 'bg-gray-100 text-gray-700 ring-1 ring-gray-300',
};

export function formatSizes(sizes: AdSize[]): string {
  return sizes
    .filter((s) => s.w > 0 || s.h > 0)
    .map((s) => `${s.w}×${s.h} (${s.context})`)
    .join(', ') || 'Native (no fixed size)';
}

export function isCampaignActive(c: AdCampaign): boolean {
  if (!c.active) return false;
  const today = new Date().toISOString().slice(0, 10);
  return c.start_date <= today && today <= c.end_date;
}

export function campaignStatus(c: AdCampaign): {
  label: string;
  className: string;
} {
  if (!c.active) {
    return { label: 'Paused', className: 'bg-gray-100 text-gray-700' };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (today < c.start_date) {
    return { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' };
  }
  if (today > c.end_date) {
    return { label: 'Expired', className: 'bg-red-100 text-red-700' };
  }
  return { label: 'Live', className: 'bg-green-100 text-green-800' };
}
