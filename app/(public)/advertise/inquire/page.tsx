import InquireForm from './InquireForm';
import PageTitle from '@/components/ui/PageTitle';
import { APP_AD_SLOTS, PACKAGES, EBLASTS } from '@/lib/media-kit';
import { isAdChannel, deriveChannelFromSlot, type AdChannel } from '@/lib/ad-channels';

export const metadata = {
  title: 'Reserve Your Ad Spot — RealtyLine & Newsline San Antonio',
  description:
    'Inquire about Print, Digital, or Email advertising on RealtyLine and Newsline San Antonio. Tell us about your business and we will follow up with rates and availability.',
};

// Map digital ad-slot slugs to user-friendly labels for the form context line.
// Kept narrow on purpose — only slugs the public inquiry surface needs.
const DIGITAL_SLOT_LABELS: Record<string, string> = Object.fromEntries(
  APP_AD_SLOTS.map((s) => [s.slug, s.name]),
);

type SearchParams = {
  slot?: string;
  pub?: string;
  channel?: string;
  package?: string;
};

export default async function AdvertiseInquirePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const slot = params.slot ?? '';
  const pkg = params.package ?? '';
  const pub = params.pub === 'newsline' ? 'newsline' : 'realtyline';

  // Resolve channel: explicit query param wins, then derive from slot/package,
  // then default to 'digital' so a bare /advertise/inquire still renders.
  const channel: AdChannel =
    (params.channel && isAdChannel(params.channel) && params.channel) ||
    deriveChannelFromSlot(slot || pkg) ||
    'digital';

  // Resolve a human label for the chosen target so the form headline can
  // reflect what the buyer clicked on.
  const slotLabel =
    DIGITAL_SLOT_LABELS[slot] ??
    PACKAGES.find((p) => p.id === pkg)?.name ??
    EBLASTS.find((e) => e.name.toLowerCase().replace(/\s+/g, '') === pkg.toLowerCase())?.name ??
    '';

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
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

      <InquireForm
        initialSlot={slot}
        initialSlotLabel={slotLabel}
        initialPackage={pkg}
        initialChannel={channel}
        pub={pub}
      />
        </div>
    </main>
  );
}
