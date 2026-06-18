// app/(public)/advertise/checkout/[slot]/page.tsx
//
// Self-serve advertiser checkout page. Resolves the slot from APP_AD_SLOTS
// (canonical rate-card source) and renders the CheckoutForm client component
// with pricing, specs, date picker, creative upload, terms, and embedded
// Stripe Elements.

import { notFound } from 'next/navigation';
import { APP_AD_SLOTS } from '@/lib/media-kit';
import { getBookedPubsForSlot } from '@/lib/server/slot-availability';
import CheckoutForm from './CheckoutForm';
import PageTitle from '@/components/ui/PageTitle';
import type { Metadata } from 'next';

type RouteCtx = {
  params: Promise<{ slot: string }>;
  searchParams: Promise<{
    pub?: string;
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  }>;
};

export async function generateMetadata(ctx: RouteCtx): Promise<Metadata> {
  const { slot } = await ctx.params;
  const s = APP_AD_SLOTS.find((x) => x.slug === slot);
  return {
    title: s ? `Book ${s.name} — RealtyLine Austin` : 'Advertiser Checkout',
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage(ctx: RouteCtx) {
  const { slot: slug } = await ctx.params;
  const sp = await ctx.searchParams;
  const slot = APP_AD_SLOTS.find((s) => s.slug === slug);
  if (!slot) notFound();

  // Public checkout exposes four single-pub markets. Legacy ?pub=both
  // permalinks fall back to RealtyLine — the bundle option was removed
  // from this page per the 2026-06-16 product decision and bundle buys
  // now flow through admin BookingBuilder.
  type PubInitial =
    | 'realtyline'
    | 'newsline'
    | 'realtyline-houston'
    | 'realtyline-dallas';
  const PUB_INITIALS: ReadonlyArray<PubInitial> = [
    'realtyline',
    'newsline',
    'realtyline-houston',
    'realtyline-dallas',
  ];
  // Pre-launch markets (Houston, Dallas/FTW) are surfaced as disabled
  // "Coming soon" pills in the publication selector. Don't pre-select
  // them — if a buyer arrives with ?pub=realtyline-houston we fall back
  // to RealtyLine so the form starts in a bookable state.
  const PRELAUNCH_PUBS: ReadonlyArray<PubInitial> = [
    'realtyline-houston',
    'realtyline-dallas',
  ];
  const initialPub: PubInitial =
    sp.pub &&
    (PUB_INITIALS as readonly string[]).includes(sp.pub) &&
    !(PRELAUNCH_PUBS as readonly string[]).includes(sp.pub)
      ? (sp.pub as PubInitial)
      : 'realtyline';

  // Pre-fill from the /advertise/inquire redirect so the buyer doesn't have
  // to re-type contact info they already submitted. Capped to reasonable
  // lengths so the URL can't be used to inject huge defaults.
  const trimmed = (v: string | undefined, max: number) =>
    typeof v === 'string' ? v.slice(0, max) : '';
  const initialName = trimmed(sp.name, 200);
  const initialEmail = trimmed(sp.email, 320);
  const initialPhone = trimmed(sp.phone, 50);
  const initialCompany = trimmed(sp.company, 200);

  // Live availability: query ad_campaigns for any active booking that
  // overlaps the default window. The CheckoutForm grays out booked
  // scopes; the API enforces the same rule on payment intent creation.
  //
  // Narrowed to the four single-pub markets the public checkout exposes.
  // Legacy 'both' bundle bookings are intentionally dropped here — the
  // bundle option is no longer surfaced on this page (admin BookingBuilder
  // still creates them), so showing it as "sold" would be misleading.
  const bookedPubsSet = await getBookedPubsForSlot(slot.slug);
  const NARROW_BOOKED: ReadonlyArray<PubInitial> = [
    'realtyline',
    'newsline',
    'realtyline-houston',
    'realtyline-dallas',
  ];
  const bookedPubs = Array.from(bookedPubsSet).filter(
    (p): p is PubInitial => (NARROW_BOOKED as readonly string[]).includes(p),
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            {slot.tier} placement · {slot.zone}
          </p>
          <PageTitle size="md">Book {slot.name}</PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
            Choose your dates, upload your creative, accept the terms, and pay
            securely. Your ad goes live as soon as we verify the creative meets
            spec — usually within one business day.
          </p>
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Placement summary
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Creative spec</dt>
              <dd className="font-medium text-gray-900">{slot.sizes}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Placement notes</dt>
              <dd className="font-medium text-gray-900">{slot.notes}</dd>
            </div>
          </dl>
        </div>

        <CheckoutForm
          slot={slot}
          initialPub={initialPub}
          initialName={initialName}
          initialEmail={initialEmail}
          initialPhone={initialPhone}
          initialCompany={initialCompany}
          bookedPubs={bookedPubs}
        />

        <p className="text-center text-xs text-gray-500 mt-10">
          Need help? Email <a href="mailto:hello@myrealtyline.com" className="underline">hello@myrealtyline.com</a> or call us — we&apos;ll book you manually.
        </p>
      </div>
    </div>
  );
}
