import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { getPlatinumAccess } from '@/lib/server/platinum-store';
import { PLATINUM_PAYWALL_ENABLED } from '@/lib/server/auth/platinum';
import RnnPlatinumPaywall from '@/components/RnnPlatinumPaywall';
import TestimonialHubClient from './TestimonialHubClient';

export const metadata = {
  title: 'Testimonial Hub | Realty News Now',
  description: 'Collect, organize, and publish client testimonials.',
};

export const dynamic = 'force-dynamic';

export default async function TestimonialHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Ftestimonial-hub');
  const access = await getPlatinumAccess(user.realtorId);
  if (PLATINUM_PAYWALL_ENABLED && !access.active) {
    const checkoutAvailable = Boolean(
      process.env.STRIPE_SECRET_KEY?.trim()
      && process.env.STRIPE_RNN_PLATINUM_PRICE_ID?.trim(),
    );
    return (
      <RnnPlatinumPaywall
        checkoutAvailable={checkoutAvailable}
        trialAvailable={!access.trial_started_at}
      />
    );
  }
  return <TestimonialHubClient />;
}
