// /admin/ads/media-kit
//
// Legacy route. The canonical Media Kit lives at /admin/media-kit (linked
// from the "Sales" nav group). Redirect there so the old Ads-hub links and
// any bookmarks keep working.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Media Kit — Admin',
};

export default function MediaKitPage() {
  redirect('/admin/media-kit');
}
