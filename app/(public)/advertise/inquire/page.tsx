import InquireForm from './InquireForm';
import PageTitle from '@/components/ui/PageTitle';

export const metadata = {
  title: 'Reserve Your Ad Spot — RealtyLine',
  description:
    'Inquire about advertising slots on RealtyLine and Newsline. Tell us about your business and we will follow up with rates and availability.',
};

// Map ad-space slugs to user-friendly labels for the form context line.
const SLOT_LABELS: Record<string, string> = {
  featured_builder_strip: 'Featured Builder Strip',
  calendar_event_sponsor: 'Pinned Calendar Event',
  calendar_top_banner: 'Calendar Top Banner',
  feed_top_banner: 'Feed Top Banner',
  feed_sticky_bottom: 'Feed Sticky Bottom',
  giveaway_prize_sponsor: 'Giveaway Prize Sponsor',
  newsletter_banner: 'Newsletter Banner',
  article_top_leaderboard: 'Article Leaderboard',
  article_mid_inline: 'Article Mid-Inline',
  article_interstitial: 'Article Interstitial',
};

type SearchParams = { slot?: string; pub?: string };

export default async function AdvertiseInquirePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const slot = params.slot ?? '';
  const slotLabel = SLOT_LABELS[slot] ?? '';
  const pub = params.pub === 'newsline' ? 'newsline' : 'realtyline';

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 md:py-16">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Reserve a spot
        </p>
        <PageTitle>
          {slotLabel
            ? `Inquire about the ${slotLabel}`
            : 'Inquire about advertising'}
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed">
          Tell us a bit about your business and we&apos;ll follow up within one
          business day with rates, availability, and creative specs.
        </p>
      </header>

      <InquireForm initialSlot={slot} initialSlotLabel={slotLabel} pub={pub} />
    </main>
  );
}
