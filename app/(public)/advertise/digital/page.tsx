// app/(public)/advertise/digital/page.tsx
//
// Public rate card for the digital ad inventory. Lists every slot in
// APP_AD_SLOTS, probes live availability against ad_campaigns, and
// renders each one as either "Book this placement" (links to the
// self-checkout) or "Join waitlist" (links to the inquiry form) when
// it's sold out across every publication.
//
// Per product decision (2026-06-16): the page-level publication picker
// was removed. Every placement is now shown unconditionally, and the
// buyer selects which publication(s) they want on the checkout page
// itself. A placement is treated as "sold out" only when every single
// publication scope it's available on is currently booked.

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { APP_AD_SLOTS, type AppAdSlot } from '@/lib/media-kit';
import {
  getSlotInventoryForAllSlots,
  type SlotInventory,
} from '@/lib/server/slot-availability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'App Ad Slots',
  description:
    'Live availability across all 16 digital placements on realtynewsnow.app. Book any open slot in under five minutes with self-serve checkout.',
};

// Availability disclaimer shown before booking: sets the up-to-2-days
// review/approval expectation and offers the two fast-track contacts.
// Tawanna is text-only (sms:); Doren can be called (tel:).
const TAWANNA_SMS = '+15129650057';
const DOREN_TEL = '+15125143141';

function rateLine(s: AppAdSlot): string {
  const unit = s.pricingUnit ?? 'week';
  const u = unit === 'per send' ? 'send' : unit === 'per push' ? 'push' : 'wk';
  const mo = s.monthlySingle ? ` · $${s.monthlySingle}/mo` : '';
  return `$${s.weeklySingle}/${u} single pub${mo}`;
}

const TIER_ORDER: Record<string, number> = { premium: 0, standard: 1, light: 2 };

export default async function AdvertiseDigitalPage() {
  // Single SQL query returns placement-level inventory (capacity / sold /
  // available / soldOut) for every slot, using the same reserving states,
  // date window, and bookable-pub set as the checkout availability check.
  // Fails open inside the helper, so we never have to catch here.
  const inventoryBySlug = await getSlotInventoryForAllSlots();

  const availability = APP_AD_SLOTS.map((slot) => {
    const inv: SlotInventory = inventoryBySlug.get(slot.slug) ?? {
      capacity: 1,
      sold: 0,
      available: 1,
      soldOut: false,
    };
    return { slot, inv, soldOut: inv.soldOut };
  });

  // Available first, sold-out last; within each group, premium tier first.
  availability.sort((a, b) => {
    if (a.soldOut !== b.soldOut) return a.soldOut ? 1 : -1;
    const ta = TIER_ORDER[a.slot.tier] ?? 9;
    const tb = TIER_ORDER[b.slot.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.slot.name.localeCompare(b.slot.name);
  });

  const availableCount = availability.filter((a) => !a.soldOut).length;
  const totalCount = availability.length;

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Advertise · App
        </p>
        <PageTitle size="md">
          App Ad Slots
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          {availableCount} of {totalCount} placements are open right now across
          our publications. Pick any open slot, choose your publication and
          dates at checkout, upload your creative, and pay by card in under
          five minutes — your ad goes live as soon as we verify the creative
          meets spec, usually within one business day.
        </p>
        <p className="mt-4">
          <Link
            href="/advertise/placements"
            className="text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-700"
          >
            See where each ad appears in the app →
          </Link>
        </p>

        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Please allow up to 2 days for your ad space to go live after payment
          while we review and approve your creative. Need it sooner? Text
          Tawanna at{' '}
          <a href={`sms:${TAWANNA_SMS}`} className="font-semibold underline underline-offset-2">
            512-965-0057
          </a>{' '}
          (text only) or contact Doren at{' '}
          <a href={`tel:${DOREN_TEL}`} className="font-semibold underline underline-offset-2">
            512-514-3141
          </a>
          .
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {availability.map(({ slot, inv, soldOut }) => {
          // No page-level pub filter anymore — the buyer picks the market on
          // the checkout page itself. Default the deep link to 'realtyline'
          // so the checkout's initial Publication pill is the most common
          // choice; the buyer can switch with one click.
          const checkoutHref = `/advertise/checkout/${slot.slug}?pub=realtyline`;
          const waitlistHref = `/advertise/inquire?slot=${slot.slug}`;
          return (
            <article
              key={slot.slug}
              className={`flex flex-col border rounded-md p-5 ${
                soldOut ? 'border-gray-200 bg-gray-50/60' : 'border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium">
                  {slot.tier} · {slot.zone}
                </span>
                {soldOut ? (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                    Sold out
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    Available
                  </span>
                )}
              </div>

              <h3 className={`text-lg font-semibold mb-1 ${soldOut ? 'text-gray-500' : 'text-brand-700'}`}>
                {slot.name}
              </h3>

              <p className={`text-sm mb-2 ${soldOut ? 'text-gray-400' : 'text-gray-700'}`}>
                {rateLine(slot)}
              </p>

              <p className={`text-xs font-medium mb-2 ${soldOut ? 'text-amber-700' : 'text-emerald-700'}`}>
                {soldOut
                  ? `Sold out · ${inv.sold} sold`
                  : `${inv.available} available · ${inv.sold} sold`}
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
                    className="inline-block w-full text-center border border-gray-300 text-gray-600 text-sm font-semibold py-2.5 rounded-md hover:bg-gray-100"
                  >
                    Join waitlist
                  </Link>
                ) : (
                  <Link
                    href={checkoutHref}
                    className="inline-block w-full text-center bg-brand-700 text-white text-sm font-semibold py-2.5 rounded-md hover:bg-brand-700"
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
          <Link href="/advertise/inquire" className="text-brand-700 underline font-semibold">
            Talk to our team
          </Link>{' '}
          — we&apos;ll send a custom quote within one business day.
        </p>
      </footer>
        </div>
    </main>
  );
}
