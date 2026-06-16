// app/(public)/advertise/digital/page.tsx
//
// Public rate card for the digital ad inventory. Lists every slot in
// APP_AD_SLOTS, probes live availability against ad_campaigns, and
// renders each one as either "Book this placement" (links to the
// self-checkout) or "Join waitlist" (links to the inquiry form) when
// it's sold out on the requested pub.
//
// Query param ?pub=realtyline|newsline controls which publication's
// inventory we surface; defaults to RealtyLine to match the rest of
// the site. ?pub=both is also accepted and probes both pubs.

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { APP_AD_SLOTS, getSlotAvailablePubs, type AppAdSlot } from '@/lib/media-kit';
import { getBookedPubsForAllSlots } from '@/lib/server/slot-availability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Digital Placements — RealtyLine & Newsline San Antonio',
  description:
    'Live availability across all 17 digital placements on realtynewsnow.app. Book any open slot in under five minutes with self-serve checkout.',
};

type Pub = 'realtyline' | 'newsline' | 'both';

function normalizePub(raw: string | string[] | undefined): Pub {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'newsline' || v === 'san_antonio') return 'newsline';
  if (v === 'both') return 'both';
  return 'realtyline';
}

function pubLabel(p: Pub): string {
  if (p === 'newsline') return 'Newsline San Antonio';
  if (p === 'both') return 'Both publications';
  return 'RealtyLine Austin';
}

function rateLine(s: AppAdSlot, pub: Pub): string {
  const unit = s.pricingUnit ?? 'week';
  const u = unit === 'per send' ? 'send' : unit === 'per push' ? 'push' : 'wk';
  if (pub === 'both' && s.weeklyBoth > 0) {
    const mo = s.monthlyBoth ? ` · $${s.monthlyBoth}/mo` : '';
    return `$${s.weeklyBoth}/${u} both pubs${mo}`;
  }
  const mo = s.monthlySingle ? ` · $${s.monthlySingle}/mo` : '';
  return `$${s.weeklySingle}/${u} single pub${mo}`;
}

const TIER_ORDER: Record<string, number> = { premium: 0, standard: 1, light: 2 };

export default async function AdvertiseDigitalPage({
  searchParams,
}: {
  searchParams: Promise<{ pub?: string }>;
}) {
  const params = await searchParams;
  const pub = normalizePub(params.pub);

  // Single SQL query returns blocked-pub sets for every slot at once.
  // Fails open inside the helper, so we never have to catch here.
  const blockedBySlug = await getBookedPubsForAllSlots();

  const availability = APP_AD_SLOTS.map((slot) => {
    const allowedPubs = getSlotAvailablePubs(slot);
    const compatible = allowedPubs.includes(pub);
    if (!compatible) {
      return { slot, soldOut: true, compatible: false };
    }
    const blocked = blockedBySlug.get(slot.slug) ?? new Set<typeof pub>();
    return { slot, soldOut: blocked.has(pub), compatible: true };
  });

  // Available first, sold-out last; within each group, premium tier first.
  availability.sort((a, b) => {
    if (a.soldOut !== b.soldOut) return a.soldOut ? 1 : -1;
    const ta = TIER_ORDER[a.slot.tier] ?? 9;
    const tb = TIER_ORDER[b.slot.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.slot.name.localeCompare(b.slot.name);
  });

  const availableCount = availability.filter((a) => !a.soldOut && a.compatible).length;
  const totalCount = availability.length;

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Advertise · Digital
        </p>
        <PageTitle>
          Every digital placement, live availability.
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          {availableCount} of {totalCount} placements are open on{' '}
          <strong>{pubLabel(pub)}</strong> right now. Pick any open slot and
          you can choose dates, upload your creative, and pay by card in under
          five minutes — your ad goes live as soon as we verify the creative
          meets spec, usually within one business day.
        </p>

        {/* Pub switcher */}
        <div className="mt-6 inline-flex border border-gray-300 rounded overflow-hidden text-sm">
          {(['realtyline', 'newsline', 'both'] as const).map((p) => (
            <Link
              key={p}
              href={`/advertise/digital?pub=${p}`}
              className={`px-4 py-2 ${
                pub === p
                  ? 'bg-[#1a2a44] text-white font-semibold'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p === 'realtyline' ? 'RealtyLine Austin' : p === 'newsline' ? 'Newsline San Antonio' : 'Both pubs'}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {availability.map(({ slot, soldOut }) => {
          const checkoutHref = `/advertise/checkout/${slot.slug}?pub=${pub === 'both' ? 'both' : pub}`;
          const waitlistHref = `/advertise/inquire?slot=${slot.slug}&pub=${pub === 'both' ? 'realtyline' : pub}`;
          return (
            <article
              key={slot.slug}
              className={`flex flex-col border rounded p-5 ${
                soldOut ? 'border-gray-200 bg-gray-50/60' : 'border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium">
                  {slot.tier} · {slot.zone}
                </span>
                {soldOut ? (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                    Sold out
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Available
                  </span>
                )}
              </div>

              <h3 className={`text-lg font-semibold mb-1 ${soldOut ? 'text-gray-500' : 'text-[#1a2a44]'}`}>
                {slot.name}
              </h3>

              <p className={`text-sm mb-2 ${soldOut ? 'text-gray-400' : 'text-gray-700'}`}>
                {rateLine(slot, pub)}
              </p>

              <p className={`text-xs mb-1 ${soldOut ? 'text-gray-400' : 'text-gray-600'}`}>
                <strong>Specs:</strong> {slot.sizes}
              </p>
              <p className={`text-xs mb-4 ${soldOut ? 'text-gray-400' : 'text-gray-600'}`}>
                {slot.notes}
              </p>

              <div className="mt-auto pt-2">
                {soldOut ? (
                  <Link
                    href={waitlistHref}
                    className="inline-block w-full text-center border border-gray-300 text-gray-600 text-sm font-semibold py-2.5 rounded hover:bg-gray-100"
                  >
                    Join waitlist
                  </Link>
                ) : (
                  <Link
                    href={checkoutHref}
                    className="inline-block w-full text-center bg-[#1a2a44] text-white text-sm font-semibold py-2.5 rounded hover:bg-[#0f1d36]"
                  >
                    Book this placement
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <footer className="mt-12 pt-8 border-t border-gray-200 text-sm text-gray-600">
        <p>
          Need something custom or want to combine placements?{' '}
          <Link href="/advertise/inquire" className="text-[#1a2a44] underline font-semibold">
            Talk to our team
          </Link>{' '}
          — we&apos;ll send a custom quote within one business day.
        </p>
      </footer>
    </main>
  );
}
