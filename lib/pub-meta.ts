// Brand metadata per publication.
// Single source of truth for name, city, and brand color used across
// the calendar/events surfaces. Other PUB_META copies in the codebase
// (PUB_META_AR in dashboard for ArticleReader; possibly others) should
// converge here in a future cleanup.

export type PubKey = 'realtyline' | 'newsline';

export interface PubMeta {
  name: string;
  city: string;
  color: string;
}

export const PUB_META: Record<PubKey, PubMeta> = {
  realtyline: { name: 'RealtyLine', city: 'Austin', color: '#021D40' },
  newsline: { name: 'Newsline San Antonio', city: 'San Antonio', color: '#3D0740' },
};
