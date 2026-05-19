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
