import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Realty News Now',
    short_name: 'RNN',
    description:
      'Texas real estate news, magazine issues, and event alerts for RealtyLine and Newsline readers.',
    // Use a stable 200 endpoint as start_url. The previous '/dashboard' value
    // sometimes caused iOS standalone PWAs to show a 'couldn't load' error
    // because of the redirect chain from '/' → '/dashboard'.
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
