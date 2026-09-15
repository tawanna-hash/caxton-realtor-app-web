import type { Metadata } from 'next';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { listTrecDeals } from '@/lib/server/trec-deals';
import TrecOneFourClient from './TrecOneFourClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'TREC 1–4 Deal Prep — Agent Command Center',
};

export default async function TrecOneFourPage() {
  const admin = await getCurrentAdmin();
  const initialDeals = admin
    ? await listTrecDeals().catch((error) => {
      console.error('[trec-1-4 page] saved deals unavailable', error);
      return [];
    })
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <TrecOneFourClient initialDeals={initialDeals} />
    </div>
  );
}
