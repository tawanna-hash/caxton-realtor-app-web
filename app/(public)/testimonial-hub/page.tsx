import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import TestimonialHubClient from './TestimonialHubClient';

export const metadata = {
  title: 'Testimonial Hub | Realty News Now',
  description: 'Collect, organize, and publish client testimonials.',
};

export const dynamic = 'force-dynamic';

export default async function TestimonialHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Ftestimonial-hub');
  return <TestimonialHubClient />;
}
