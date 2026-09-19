// /admin/ads/media-kit
//
// Canonical Media Kit route (rendered by MediaKitClient). The legacy
// /admin/media-kit route redirects here. Linked from the "Sales" nav group.

import MediaKit from '@/components/ads/MediaKit';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Media Kit — Admin',
};

export default function MediaKitPage() {
  return <MediaKit />;
}
