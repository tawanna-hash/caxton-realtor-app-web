import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { PublicationProvider } from '@/lib/publication-provider';
import { getServerPub } from '@/lib/publication';
import { siteStructuredData } from '@/lib/structured-data';

// The signed-in feed. `/` now serves a public landing page for signed-out
// visitors and redirects signed-in users here. This page keeps its own
// canonical so /dashboard?article=... variants consolidate onto one URL.
export const metadata: Metadata = {
  alternates: { canonical: 'https://realtynewsnow.app/dashboard' },
};

const STRUCTURED_DATA = siteStructuredData();

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
