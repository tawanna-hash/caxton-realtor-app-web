import type { Metadata } from 'next';
import TrecOneFourClient from './TrecOneFourClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'TREC 1–4 Deal Prep — Agent Command Center',
};

export default function TrecOneFourPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <TrecOneFourClient />
    </div>
  );
}
