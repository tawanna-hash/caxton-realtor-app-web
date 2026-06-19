// app/opengraph-image.tsx
//
// Next.js Metadata Files API — emits /opengraph-image at build time, served
// as the default og:image for the homepage and inherited by every route
// that doesn't supply its own. This is what shows in iMessage, X, LinkedIn,
// Slack, Facebook, etc. link previews. Renders 1200x630 (the OG spec size)
// using @vercel/og under the hood.
//
// Keep this purely CSS — no external font loading or remote image fetches
// — so it never fails to render at build time.

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Realty News Now — Texas real estate, daily.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: '#000000',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top mark — RNN wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              fontSize: '64px',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              color: '#ffffff',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            RNN
          </div>
          <div
            style={{
              fontSize: '22px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#9ca3af',
              fontWeight: 600,
            }}
          >
            Realty News Now
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              fontSize: '80px',
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              maxWidth: '1000px',
            }}
          >
            Texas real estate, daily.
          </div>
          <div
            style={{
              fontSize: '32px',
              lineHeight: 1.3,
              color: '#d1d5db',
              maxWidth: '900px',
              fontWeight: 400,
            }}
          >
            Free REALTOR® app — news, calendars, calculators, and the rate
            card for RealtyLine, Newsline San Antonio, Houston, and Dallas.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: '22px',
            color: '#9ca3af',
          }}
        >
          <div style={{ display: 'flex', gap: '32px' }}>
            <span>RealtyLine · Austin</span>
            <span>·</span>
            <span>Newsline · San Antonio</span>
          </div>
          <div style={{ color: '#ffffff', fontWeight: 600 }}>
            realtynewsnow.app
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
