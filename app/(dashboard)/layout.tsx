import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { PublicationProvider } from '@/lib/publication-provider';
import { getServerPub } from '@/lib/publication';

// The homepage (`/` redirects here). Canonical points at /dashboard (the final URL after the / redirect) so
// /dashboard and /?article=... variants consolidate onto one URL, matching the
// sitemap and og:url.
export const metadata: Metadata = {
  alternates: { canonical: 'https://realtynewsnow.app/dashboard' },
};

const SITE_URL = 'https://realtynewsnow.app';
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Realty News Now',
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      description:
        'Free REALTOR app for Texas real estate professionals: daily news, event calendars, rate cards, and pro tools for RealtyLine (Austin) and Newsline (San Antonio).',
      sameAs: [
        'https://www.facebook.com/myrealtyline',
        'https://www.instagram.com/myrealtyline',
        'https://www.facebook.com/newslinesa',
        'https://www.instagram.com/newsline_sanantonio',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Realty News Now',
      inLanguage: 'en-US',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

// Previously this layout rendered only <div>, which left /dashboard (the
// destination of the root `/` redirect) without any site navigation. A
// logged-out first-time visitor would land on the PubSelector dropdown
// with no header, hamburger, footer, BottomNav, or login link — a hard
// dead-end. Wrapping in AppShell variant="public" ensures every entry
// to /dashboard surfaces the standard public chrome (top nav, drawer,
// footer, BottomNav) regardless of which dashboard phase renders below.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialPub = await getServerPub();
  return (
    <PublicationProvider initialPub={initialPub}>
      <AppShell variant="public" initialPub={initialPub}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        {/* Main headline for search engines and screen readers. The dashboard
            views render their own visible headings. */}
        <h1 className="sr-only">Realty News Now: Real estate news, all in one app</h1>
        {children}
      </AppShell>
    </PublicationProvider>
  );
}
