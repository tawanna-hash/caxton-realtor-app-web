// Brand metadata per publication.
// Single source of truth for name, city, brand color, and ad-sales
// metadata (tagline, reach, email) used across all surfaces.

export type PubKey = 'realtyline' | 'newsline';

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
    email: 'ads@myrealtyline.com',
    facebook: 'https://www.facebook.com/myrealtyline/',
    // TODO(social): waiting on Instagram + LinkedIn URLs.
    instagram: '#',
    linkedin: '#',
  },
  newsline: {
    name: 'Newsline San Antonio',
    city: 'San Antonio',
    color: '#3D0740',
    tagline: 'Reach 24,000+ San Antonio real estate professionals',
    reach: '24,000+ San Antonio REALTORS',
    email: 'ads@newslinesa.com',
    facebook: 'https://www.facebook.com/newslinesa/',
    // TODO(social): waiting on Instagram + LinkedIn URLs.
    instagram: '#',
    linkedin: '#',
  },
};
