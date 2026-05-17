// app/admin/reports/_types.ts
// Shared types for the admin report builder.

export type ArticleListItem = {
  article_id: string;
  title: string;
  pub: string | null;
  opens: number;
};

export type ShareChannel = {
  channel: string;
  total: number;
};

export type ScrollMilestone = {
  milestone: number;
  total: number;
};

export type ArticleMeta = {
  article_id: string;
  title: string | null;
  pub: string | null;
  cat: string | null;
};

export type ArticleReport = {
  article: ArticleMeta;
  range_days: number;
  opens: number;
  shares: ShareChannel[];
  shares_total: number;
  scroll: ScrollMilestone[];
  avg_time_on_article_ms: number;
  sessions_with_time: number;
  saves: number;
  unsaves: number;
  net_saves: number;
};

// Channel labels for human-readable display.
export const CHANNEL_LABELS: Record<string, string> = {
  twitter: 'X / Twitter',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  email: 'Email',
  copy_link: 'Copy link',
  copy: 'Copy',
  copy_fallback: 'Copy (fallback)',
  native: 'Native share',
  native_sharerow: 'Native share',
};

// Format ms as "m:ss"
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}


// Per-pub brand configuration. The pub override on the report drives
// which brand renders.
export type BrandConfig = {
  pub_key: string;          // 'realtyline' | 'newsline' | 'caxton'
  pub_display: string;      // 'RealtyLine Austin' etc.
  primary_hex: string;      // navy or accent color used in HTML
  tagline: string;
};

export const BRANDS: Record<string, BrandConfig> = {
  realtyline: {
    pub_key: 'realtyline',
    pub_display: 'RealtyLine Austin',
    primary_hex: '#021D40',
    tagline: 'Putting A Face On Real Estate',
  },
  newsline: {
    pub_key: 'newsline',
    pub_display: 'Newsline San Antonio',
    primary_hex: '#2d1a44',
    tagline: 'Putting A Face On Real Estate',
  },
  caxton: {
    pub_key: 'caxton',
    pub_display: 'Caxton Publications',
    primary_hex: '#1a2a44',
    tagline: 'Putting A Face On Real Estate',
  },
};

export function resolveBrand(pubGuess: string | null): BrandConfig {
  if (!pubGuess) return BRANDS.caxton;
  const key = pubGuess.toLowerCase();
  return BRANDS[key] ?? BRANDS.caxton;
}

export type ReportOverrides = {
  title: string;
  pub_display: string;
  editorial_note: string;
};


// ─── Events report types ───

export type EventListItem = {
  event_id: string;
  title: string;
  pub: string | null;
  card_clicks: number;
  registrations: number;
};

export type EventMeta = {
  event_id: string;
  title: string | null;
  pub: string | null;
};

export type EventReport = {
  event: EventMeta;
  range_days: number;
  card_clicks: number;
  registrations: number;
  calendar_adds: number;
  directions_clicks: number;
  shares: ShareChannel[];
  shares_total: number;
};

// Event-share channel labels (smaller set than articles)
export const EVENT_CHANNEL_LABELS: Record<string, string> = {
  native: 'Native share',
  copy: 'Copy link',
};
