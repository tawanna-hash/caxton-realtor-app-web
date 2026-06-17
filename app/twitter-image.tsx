// app/twitter-image.tsx
//
// Twitter card image. Next.js / Turbopack requires the route segment
// config values (runtime, alt, size, contentType) to be statically
// declared per file rather than re-exported, so we duplicate them here
// and delegate the actual renderer to opengraph-image's default export.

import OpenGraphImage from './opengraph-image';

export const runtime = 'edge';
export const alt = 'Realty News Now — Texas real estate, daily.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  return OpenGraphImage();
}
