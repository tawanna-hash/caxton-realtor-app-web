'use client';

// components/MagazineReaderRouter.tsx
//
// Picks the right reader implementation per magazine:
//   - Vercel Blob PDF URL → InteractiveMagazineReader (native PDF render
//     with clickable links, text selection, crisp at any zoom)
//   - WP /pdfviewer/ URL or no PDF → MagazineReader (legacy JPEG flipbook
//     with page-curl animation)
//
// The legacy 9 magazines on the site use WP pdfviewer URLs that can't be
// fetched cross-origin or directly rendered, so they keep the JPEG flow.
// New magazines uploaded via the admin form have direct Blob PDF URLs
// and get the interactive treatment.

import type { Magazine } from '@/lib/magazines';
import MagazineReader from './MagazineReader';
import InteractiveMagazineReader from './InteractiveMagazineReader';

interface Props {
  magazine: Magazine;
  brandColor: string;
  onClose: () => void;
}

function isInteractive(magazine: Magazine): boolean {
  const url = magazine.reader_url;
  if (!url) return false;
  // Direct PDF on Vercel Blob — fetchable + renderable.
  if (/\.public\.blob\.vercel-storage\.com\//.test(url)) return true;
  if (/\.vercel-storage\.com\//.test(url)) return true;
  // Anything else (WP pdfviewer, third-party hosts) — use legacy reader.
  return false;
}

export default function MagazineReaderRouter({ magazine, brandColor, onClose }: Props) {
  if (isInteractive(magazine)) {
    return <InteractiveMagazineReader magazine={magazine} brandColor={brandColor} onClose={onClose} />;
  }
  return <MagazineReader magazine={magazine} brandColor={brandColor} onClose={onClose} />;
}
