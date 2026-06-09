import { PublicationProvider } from '@/lib/publication-provider';
import { getServerPub } from '@/lib/publication';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialPub = await getServerPub();
  return (
    <PublicationProvider initialPub={initialPub}>
      <main className="min-h-screen bg-gray-50">
        {children}
      </main>
    </PublicationProvider>
  );
}
