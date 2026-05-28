'use client';

// components/MagazineReaderRouter.tsx
//
// Picks the right reader implementation per magazine, based on whether the
// magazine's reader_url is a DIRECTLY-FETCHABLE PDF (which the interactive
// reader can download + render with pdfjs) or a viewer PAGE / unknown host
// (which it cannot, so it must use the legacy JPEG flipbook).
//
// INTERACTIVE (InteractiveMagazineReader) — native PDF render, clickable
//   links, text selection, crisp at any zoom. Requires the URL to resolve to
//   raw PDF bytes that we can fetch same-origin or via CORS:
//     - Vercel Blob:            *.vercel-storage.com/....pdf
//     - Any direct .pdf URL:    https://host/path/file.pdf  (incl. ?query)
//
// LEGACY (MagazineReader) — JPEG flipbook with page-curl. Used for anything
//   that is NOT a directly-fetchable PDF:
//     - WordPress viewer pages: .../pdfviewer/<slug>/?auto_viewer=true
//       (these are HTML viewer wrappers, NOT a raw PDF — fetching them as a
//       PDF would fail, so they MUST stay on the legacy reader)
//     - Any third-party host that isn't a direct .pdf
//     - No reader_url at all
//
// IMPORTANT — why this matters for Newsline San Antonio:
//   SA issues currently have WordPress reader_urls like
//   https://www.newslinesa.com/pdfviewer/april-2026/?auto_viewer=true
//   These are viewer PAGES, so they correctly fall to the legacy reader.
//   To give SA the interactive flipbook, re-upload the SA PDFs through the
//   admin magazine form so reader_url becomes a Vercel Blob .pdf URL — then
//   isInteractive() returns true automatically, no further code change.
//
// This file is a drop-in replacement: same Props, same default export.

import type { Magazine } from '@/lib/magazines';
import MagazineReader from './MagazineReader';
import InteractiveMagazineReader from './InteractiveMagazineReader';

interface Props {
  magazine: Magazine;
  brandColor: string;
  onClose: () => void;
}

/**
 * True when the magazine's reader_url points at raw PDF bytes that
 * InteractiveMagazineReader can fetch + render. False for viewer pages,
 * unknown hosts, or missing URLs (those use the legacy JPEG reader).
 */
function isInteractive(magazine: Magazine): boolean {
  const url = (magazine.reader_url || '').trim();
  if (!url) return false;

  // Parse the URL safely; if it isn't a valid absolute URL, treat as legacy.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only http(s) is fetchable by the reader.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // EXCLUDE WordPress (or any) PDF VIEWER PAGES explicitly. These look like a
  // PDF link but are actually an HTML viewer wrapper — fetching as PDF fails.
  // e.g. /pdfviewer/april-2026/?auto_viewer=true
  if (path.includes('/pdfviewer/')) return false;
  // Common viewer-wrapper query flag, regardless of path.
  if (parsed.searchParams.get('auto_viewer') === 'true') return false;

  // INCLUDE Vercel Blob hosts (these are always direct PDF objects).
  if (host.endsWith('.vercel-storage.com')) return true;

  // INCLUDE any URL whose path ends in .pdf (a direct PDF file on any host —
  // Blob, DreamHost, S3, etc.). The query string is ignored for this check.
  if (path.endsWith('.pdf')) return true;

  // Everything else (viewer pages, unknown hosts, no extension) → legacy.
  return false;
}

export default function MagazineReaderRouter({ magazine, brandColor, onClose }: Props) {
  if (isInteractive(magazine)) {
    return <InteractiveMagazineReader magazine={magazine} brandColor={brandColor} onClose={onClose} />;
  }
  return <MagazineReader magazine={magazine} brandColor={brandColor} onClose={onClose} />;
}
