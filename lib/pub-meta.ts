// Brand metadata per publication.
// Single source of truth for name, city, brand color, and ad-sales
// metadata (tagline, reach, email) used across all surfaces.

export type PubKey =
  | 'realtyline'
  | 'newsline'
  | 'realtyline-houston'
  | 'realtyline-dallas';

export interface PubMeta {
  name: string;
  city: string;
  color: string;
  tagline: string;
  reach: string;
  email: string;
  // Social URLs surfaced via <SocialLinks>. Leave as undefined or '#' to render
  // the icon as a disabled placeholder until the real URL is wired up.
  facebook?: string;
  instagram?: string;
  linkedin?: string;
}

export const PUB_META: Record<PubKey, PubMeta> = {
  realtyline: {
    name: 'RealtyLine',
    city: 'Austin',
    color: '#021D40',
    tagline: 'Reach 71,000+ Texas real estate professionals',
    reach: '71,000+ Texas REALTORS',
    email: 'info@myrealtyline.com',
    facebook: 'https://www.facebook.com/myrealtyline/',
    instagram: 'https://www.instagram.com/myrealtyline/',
    // TODO(social): waiting on LinkedIn URL.
    linkedin: '#',
  },
  newsline: {
    name: 'Newsline San Antonio',
    city: 'San Antonio',
    color: '#3D0740',
    tagline: 'Reach 24,000+ San Antonio real estate professionals',
    reach: '24,000+ San Antonio REALTORS',
    email: 'info@myrealtyline.com',
    facebook: 'https://www.facebook.com/newslinesa/',
    instagram: 'https://www.instagram.com/newsline_sanantonio/',
    // TODO(social): waiting on LinkedIn URL.
    linkedin: '#',
  },
  // RealtyLine Houston - activated 2026-06-15 (Phase 2 PR A).
  // Empty-shell content; surfaces render the "Content launches soon" empty
  // state until real categories, advertisers, events, and socials are added.
  // TODO(houston): swap tagline/reach with real numbers once research lands.
  // TODO(houston): set ads@ email and social URLs.
  'realtyline-houston': {
    name: 'RealtyLine Houston',
    city: 'Houston',
    color: '#021D40', // inherits RealtyLine navy
    tagline: 'Coming soon to Houston real estate professionals',
    reach: 'Houston REALTORS',
    email: 'info@myrealtyline.com',
    facebook: '#',
    instagram: '#',
    linkedin: '#',
  },
  // RealtyLine Dallas/FTW - activated 2026-06-15 (Phase 2 PR A). See notes above.
  'realtyline-dallas': {
    name: 'RealtyLine Dallas/FTW',
    city: 'Dallas',
    color: '#021D40', // inherits RealtyLine navy
    tagline: 'Coming soon to Dallas real estate professionals',
    reach: 'Dallas REALTORS',
    email: 'info@myrealtyline.com',
    facebook: '#',
    instagram: '#',
    linkedin: '#',
  },
};

// Convenience set of all valid pub keys, useful for runtime validation and
// for iterating over markets in admin tools.
export const PUB_KEYS: readonly PubKey[] = Object.keys(PUB_META) as PubKey[];

export function isPubKey(v: unknown): v is PubKey {
  return typeof v === 'string' && (PUB_KEYS as readonly string[]).includes(v);
}

// Markets that have been activated for app use (picker, content, etc.) but
// haven't yet shipped real content. They render as Coming Soon on the picker
// and show empty-state copy on every content surface. Phase 2 PR C will
// move a market out of this list once it has real content + ad inventory.
export const PRE_LAUNCH_PUB_KEYS: readonly PubKey[] = [
  'realtyline-houston',
  'realtyline-dallas',
];

export function isPreLaunchPub(key: PubKey): boolean {
  return (PRE_LAUNCH_PUB_KEYS as readonly PubKey[]).includes(key);
}
