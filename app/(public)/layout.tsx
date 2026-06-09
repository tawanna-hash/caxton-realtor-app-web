import AppShell from '@/components/AppShell';
import { PublicationProvider } from '@/lib/publication-provider';
import { getServerPub } from '@/lib/publication';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const initialPub = await getServerPub();
  return (
    <PublicationProvider initialPub={initialPub}>
      <AppShell variant="public">
        {children}
      </AppShell>
    </PublicationProvider>
  );
}
