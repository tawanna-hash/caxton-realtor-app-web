// Client-side text helpers for rendering event data in the UI.
// Distinct from the scraper-side decodeEntities in lib/scrapers/* —
// different concerns (UI rendering vs. raw HTML ingestion).

export function decodeEntities(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * Normalize imported description whitespace: unify line endings, trim each
 * line, and collapse runs of blank lines to a single blank line so
 * `whitespace-pre-wrap` rendering does not show large empty gaps.
 */
export function tidyDescription(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
