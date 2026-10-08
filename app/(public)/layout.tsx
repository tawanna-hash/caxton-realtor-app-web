import AppShell from '@/components/AppShell';
import { PublicationProvider } from '@/lib/publication-provider';
import { getServerPub } from '@/lib/publication';
import ClosingTimeGA from '@/components/ClosingTimeGA';
import { headers } from 'next/headers';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const initialPub = await getServerPub();
  const host = ((await headers()).get('x-forwarded-host') ?? (await headers()).get('host') ?? '').toLowerCase();
  const chromeless = host === 'itsalmostclosingtime.com' || host.endsWith('.itsalmostclosingtime.com');
  return (
    <PublicationProvider initialPub={initialPub}>
      <AppShell variant="public" initialPub={initialPub} chromeless={chromeless}>
        {children}
        {chromeless && <ClosingTimeGA />}
      </AppShell>
    </PublicationProvider>
  );
}
