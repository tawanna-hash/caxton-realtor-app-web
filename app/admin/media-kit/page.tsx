// app/admin/media-kit/page.tsx
//
// Old route. Kept as a 301 redirect so any existing bookmarks / links
// land on the canonical /admin/ads/media-kit URL.

import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function OldMediaKitPage() {
  permanentRedirect('/admin/ads/media-kit');
}
