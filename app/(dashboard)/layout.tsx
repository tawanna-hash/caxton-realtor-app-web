import AppShell from '@/components/AppShell';
import { PublicationProvider } from '@/lib/publication-provider';
import { getServerPub } from '@/lib/publication';

// Previously this layout rendered only <main>, which left /dashboard (the
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
      <AppShell variant="public">
        {children}
      </AppShell>
    </PublicationProvider>
  );
}
