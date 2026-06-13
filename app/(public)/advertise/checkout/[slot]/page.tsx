// app/(public)/advertise/checkout/[slot]/page.tsx
//
// Self-serve advertiser checkout page. Resolves the slot from APP_AD_SLOTS
// (canonical rate-card source) and renders the CheckoutForm client component
// with pricing, specs, date picker, creative upload, terms, and embedded
// Stripe Elements.

import { notFound } from 'next/navigation';
import { APP_AD_SLOTS } from '@/lib/media-kit';
import CheckoutForm from './CheckoutForm';
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

  const initialPub: 'realtyline' | 'newsline' | 'both' =
    sp.pub === 'newsline' || sp.pub === 'both' || sp.pub === 'realtyline'
      ? sp.pub
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            {slot.tier} placement · {slot.zone}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
            Book {slot.name}
          </h1>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Choose your dates, upload your creative, accept the terms, and pay
            securely. Your ad goes live as soon as we verify the creative meets
            spec — usually within one business day.
          </p>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Placement summary
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Creative spec</dt>
              <dd className="font-medium text-slate-900">{slot.sizes}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Placement notes</dt>
              <dd className="font-medium text-slate-900">{slot.notes}</dd>
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
        />

        <p className="text-center text-xs text-slate-500 mt-10">
          Need help? Email <a href="mailto:hello@myrealtyline.com" className="underline">hello@myrealtyline.com</a> or call us — we&apos;ll book you manually.
        </p>
      </div>
    </div>
  );
}
