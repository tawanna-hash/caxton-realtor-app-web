import type { Metadata } from 'next';
import PageTitle from '@/components/ui/PageTitle';
import TrackPageView from '@/components/analytics/TrackPageView';
import { EBLASTS } from '@/lib/media-kit';
import EblastOrderForm from './EblastOrderForm';

export const metadata: Metadata = {
  title: 'Order an e-Blast — RealtyLine & Newsline San Antonio',
  description:
    'Choose your audience and e-Blast package, reserve preferred send dates, upload creative, and pay securely online.',
  robots: { index: true, follow: true },
};

type PageProps = {
  searchParams: Promise<{ package?: string; pub?: string }>;
};

export default async function EblastOrderPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const initialPackageId = EBLASTS.some(
    (pkg) => pkg.name.toLowerCase().replace(/\s+/g, '') === sp.package,
  )
    ? sp.package
    : undefined;
  const initialPublication =
    sp.pub === 'newsline' || sp.pub === 'both' ? sp.pub : 'realtyline';

  return (
    <>
      <TrackPageView event="advertise_eblast_order_page_viewed" />
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
          <header className="mb-7">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
              Self-Service · e-Blast
            </p>
            <PageTitle size="md">Reserve an e-Blast in minutes.</PageTitle>
            <p className="mt-4 max-w-3xl text-base font-light leading-relaxed text-gray-700">
              Select your audience and package, request your send dates, provide
              the campaign details, and pay securely. Our team reviews every
              order and confirms the schedule before the first send.
            </p>
          </header>

          <div className="mb-6 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
            Preferred dates are requests until confirmed. Please order at least
            three business days before your first requested send.
          </div>

          <EblastOrderForm
            packages={EBLASTS}
            initialPackageId={initialPackageId}
            initialPublication={initialPublication}
          />
        </div>
      </main>
    </>
  );
}
