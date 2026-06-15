// Markets shown on the publication picker as "Coming Soon" tiles. These
// are NOT yet wired into the pub-aware data layer (no PubKey expansion, no
// content registry, no ad slot inventory). They exist purely so visitors can
// see future markets and express interest via the notify-me modal.
//
// Phase 2 activation will hoist a market from this list into PUB_META and
// PubKey when content + Stripe + ad inventory are ready.

export type ComingSoonPubId = 'realtyline-houston' | 'realtyline-dallas';

export interface ComingSoonPub {
  id: ComingSoonPubId;
  name: string;
  city: string;
  tagline: string;
  color: string;
  // Two-letter monogram shown on the tile.
  monogram: string;
}

export const COMING_SOON_PUBS: ComingSoonPub[] = [
  {
    id: 'realtyline-houston',
    name: 'RealtyLine Houston',
    city: 'Houston',
    tagline: 'Coming Soon - Be the first to know',
    color: '#0B3D2E', // deep evergreen — distinct from existing brand colors
    monogram: 'RH',
  },
  {
    id: 'realtyline-dallas',
    name: 'RealtyLine Dallas',
    city: 'Dallas',
    tagline: 'Coming Soon - Be the first to know',
    color: '#7A1F2B', // deep crimson — distinct from existing brand colors
    monogram: 'RD',
  },
];

export function isComingSoonPub(id: string): id is ComingSoonPubId {
  return id === 'realtyline-houston' || id === 'realtyline-dallas';
}
