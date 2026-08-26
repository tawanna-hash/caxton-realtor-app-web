import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Crown, ExternalLink } from 'lucide-react';
import { getCurrentUser } from '@/lib/server/auth/user';
import { getPlatinumAccess } from '@/lib/server/platinum-store';
import { PLATINUM_PAYWALL_ENABLED } from '@/lib/server/auth/platinum';
import RnnPlatinumPaywall from '@/components/RnnPlatinumPaywall';

export const metadata = {
  title: 'Platinum Tools | Realty News Now',
  description: 'Premium subscriber tools from Realty News Now.',
};

export const dynamic = 'force-dynamic';

export default async function RnnPlatinumPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Frnn-platinum');
  const access = await getPlatinumAccess(user.realtorId);
  const checkoutAvailable = Boolean(
    process.env.STRIPE_SECRET_KEY?.trim()
    && process.env.STRIPE_RNN_PLATINUM_PRICE_ID?.trim(),
  );

  if (PLATINUM_PAYWALL_ENABLED && !access.active) {
    return (
      <RnnPlatinumPaywall
        checkoutAvailable={checkoutAvailable}
        trialAvailable={!access.trial_started_at}
      />
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <section className="rounded-2xl bg-[#301D5D] px-6 py-10 text-white sm:px-10">
        <Crown size={30} />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          {access.source === 'trial'
            ? '30-day complimentary trial'
            : access.active
              ? 'Active membership'
              : 'Complimentary access'}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Platinum Tools</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Your premium subscriber tools are ready.</p>
        {access.source === 'trial' && access.current_period_end && (
          <p className="mt-2 text-xs text-white/65">
            Trial access ends {new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(access.current_period_end))}.
          </p>
        )}
        <Link href="/testimonial-hub" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#301D5D]">
          Open Testimonials HUB <ExternalLink size={15} />
        </Link>
      </section>
    </main>
  );
}
