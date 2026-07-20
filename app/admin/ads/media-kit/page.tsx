// /admin/ads/media-kit
//
// Server shell — auth + metadata only. All rendering lives in the client
// component so we can hold pub-tab state.

import MediaKitClient from './MediaKitClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Media Kit — Admin',
};

export default function MediaKitPage() {
  return <MediaKitClient />;
}
