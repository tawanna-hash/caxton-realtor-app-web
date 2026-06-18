import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';

export const metadata = { title: 'Giveaways \u2014 Realty News Now' };

export default function Page() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8 sm:mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Coming soon
          </p>
          <PageTitle size="md">
            Giveaways
          </PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
            Monthly giveaways for licensed Texas REALTORS&reg;. Enter for a
            chance to win event tickets, gear, and more.
          </p>
        </header>

        <AdSlot slug="giveaway_prize_sponsor" className="mb-6" />

        <div className="border-t border-gray-200 pt-8">
          <p className="text-sm text-gray-600 leading-relaxed">
            We&apos;re finalizing our giveaway calendar. Check back soon, or{' '}
            <a
              href="/subscribe"
              className="text-[#021D40] font-medium underline underline-offset-2"
            >
              subscribe
            </a>{' '}
            to be notified when the first one opens.
          </p>
        </div>
      </div>
    </main>
  );
}
