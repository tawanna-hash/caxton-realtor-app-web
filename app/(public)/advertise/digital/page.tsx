// app/(public)/advertise/digital/page.tsx
//
// Public rate card for the digital ad inventory. Lists every slot in
// APP_AD_SLOTS, probes live availability against ad_campaigns, and
// renders each one as either "Book this placement" (links to the
// self-checkout) or "Join waitlist" (links to the inquiry form) when
// it's sold out on the requested pub.
//
// Pub selection precedence (highest to lowest):
//   1. ?pub=<key> query param on this request (rare — middleware in
//      proxy.ts normally consumes this and 308-redirects to the clean URL
//      with the caxton_pub cookie set).
//   2. caxton_pub cookie (the canonical state — set by middleware on
//      any ?pub= permalink visit, or by the in-page switcher below).
//   3. PUB_DEFAULT ('realtyline').
//
// Pre-launch markets (RealtyLine Houston, RealtyLine Dallas/FTW) are
// rendered as "Coming soon" tiles: the switcher button is visible but
// shows a dedicated empty state with a waitlist CTA instead of the
// live availability grid. This lets us surface the markets in the picker
// (so advertisers know they're coming) without selling inventory we
// don't yet have launched.

import { cookies } from 'next/headers';
import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { APP_AD_SLOTS, getSlotAvailablePubs, type AppAdSlot, type MediaKitPub } from '@/lib/media-kit';
import { getBookedPubsForAllSlots } from '@/lib/server/slot-availability';
import { PUB_COOKIE, PUB_DEFAULT } from '@/lib/publication';
import { isPubKey, isPreLaunchPub } from '@/lib/pub-meta';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Digital Placements — RealtyLine & Newsline San Antonio',
  description:
    'Live availability across all 17 digital placements on realtynewsnow.app. Book any open slot in under five minutes with self-serve checkout.',
};

type Pub = MediaKitPub;

// The full ordered list shown in the switcher. Mirrors PUB_META order and
// keeps the legacy "Both pubs" bundle at the end.
const SWITCHER_PUBS: ReadonlyArray<Pub> = [
  'realtyline',
  'newsline',
  'realtyline-houston',
  'realtyline-dallas',
  'both',
];

function normalizePub(raw: string | string[] | undefined): Pub | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  // Legacy alias from before Houston/Dallas were added.
  if (v === 'san_antonio') return 'newsline';
  if (v === 'both') return 'both';
  if (isPubKey(v)) return v;
  return null;
}

function pubLabel(p: Pub): string {
  switch (p) {
    case 'newsline':
      return 'Newsline San Antonio';
    case 'realtyline-houston':
      return 'RealtyLine Houston';
    case 'realtyline-dallas':
      return 'RealtyLine Dallas/FTW';
    case 'both':
      return 'Both publications';
    case 'realtyline':
    default:
      return 'RealtyLine Austin';
  }
}

function pubShortLabel(p: Pub): string {
  switch (p) {
    case 'newsline':
      return 'Newsline San Antonio';
    case 'realtyline-houston':
      return 'RealtyLine Houston';
    case 'realtyline-dallas':
      return 'RealtyLine Dallas/FTW';
    case 'both':
      return 'Both pubs';
    case 'realtyline':
    default:
      return 'RealtyLine Austin';
  }
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

async function resolvePub(rawParam: string | string[] | undefined): Promise<Pub> {
  // 1. Explicit query param wins (defensive — middleware usually consumes it).
  const fromParam = normalizePub(rawParam);
  if (fromParam) return fromParam;

  // 2. Cookie set by middleware (proxy.ts) on permalink visits, or by the
  //    in-page switcher button below.
  const store = await cookies();
  const fromCookie = normalizePub(store.get(PUB_COOKIE)?.value);
  if (fromCookie) return fromCookie;

  // 3. Default.
  return PUB_DEFAULT;
}

export default async function AdvertiseDigitalPage({
  searchParams,
}: {
  searchParams: Promise<{ pub?: string }>;
}) {
  const params = await searchParams;
  const pub = await resolvePub(params.pub);
  const comingSoon = pub !== 'both' && isPreLaunchPub(pub);

  // Single SQL query returns blocked-pub sets for every slot at once.
  // Fails open inside the helper, so we never have to catch here.
  // Skip the DB hit for coming-soon markets — we don't render the grid.
  const blockedBySlug = comingSoon
    ? new Map<string, Set<MediaKitPub>>()
    : await getBookedPubsForAllSlots();

  const availability = APP_AD_SLOTS.map((slot) => {
    const allowedPubs = getSlotAvailablePubs(slot);
    const compatible = allowedPubs.includes(pub);
    if (!compatible) {
      return { slot, soldOut: true, compatible: false };
    }
    const blocked = blockedBySlug.get(slot.slug) ?? new Set<MediaKitPub>();
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
        {comingSoon ? (
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
            <strong>{pubLabel(pub)}</strong> is launching soon. Get on the
            advertiser waitlist now and we&apos;ll reach out the moment
            inventory opens up — early advertisers get first pick on premium
            placements and launch-month rate locks.
          </p>
        ) : (
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
            {availableCount} of {totalCount} placements are open on{' '}
            <strong>{pubLabel(pub)}</strong> right now. Pick any open slot and
            you can choose dates, upload your creative, and pay by card in under
            five minutes — your ad goes live as soon as we verify the creative
            meets spec, usually within one business day.
          </p>
        )}

        {/* Pub switcher */}
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {SWITCHER_PUBS.map((p) => {
            const active = pub === p;
            const isComing = p !== 'both' && isPreLaunchPub(p);
            return (
              <Link
                key={p}
                href={`/advertise/digital?pub=${p}`}
                className={`px-4 py-2 border rounded transition-colors ${
                  active
                    ? 'bg-[#1a2a44] text-white font-semibold border-[#1a2a44]'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                }`}
              >
                {pubShortLabel(p)}
                {isComing && (
                  <span
                    className={`ml-2 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    Coming soon
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </header>

      {comingSoon ? (
        <section className="border border-dashed border-gray-300 rounded-lg p-10 text-center bg-gray-50/60">
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-700 font-semibold mb-3">
            Pre-launch market
          </p>
          <h2 className="text-2xl font-semibold text-[#1a2a44] mb-3">
            {pubLabel(pub)} is launching soon
          </h2>
          <p className="text-base text-gray-700 max-w-xl mx-auto mb-6 leading-relaxed">
            We&apos;re onboarding the editorial team and finalizing local
            partnerships. Advertiser waitlist spots get first pick on premium
            placements and a launch-month rate lock.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={`/advertise/inquire?pub=${pub}`}
              className="inline-block bg-[#1a2a44] text-white text-sm font-semibold px-6 py-3 rounded hover:bg-[#0f1d36]"
            >
              Join the advertiser waitlist
            </Link>
            <Link
              href="/advertise/digital?pub=realtyline"
              className="inline-block border border-gray-300 text-gray-700 text-sm font-semibold px-6 py-3 rounded hover:bg-white"
            >
              See RealtyLine Austin inventory
            </Link>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {availability.map(({ slot, soldOut }) => {
            // Checkout only supports the legacy pubs in its URL today;
            // Houston/Dallas single-pub checkouts use the same slug + pub key.
            const checkoutHref = `/advertise/checkout/${slot.slug}?pub=${pub}`;
            const waitlistHref = `/advertise/inquire?slot=${slot.slug}&pub=${
              pub === 'both' ? 'realtyline' : pub
            }`;
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
      )}

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
