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
