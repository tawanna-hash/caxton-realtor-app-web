import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import {
  getOrCreateTestimonialProfile,
  listOwnerTestimonials,
  rotateCollectionToken,
  updateTestimonialProfile,
} from '@/lib/server/testimonials-store';
import { nullableValue, testimonialProfileSchema } from '@/lib/testimonials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const [profile, testimonials] = await Promise.all([
    getOrCreateTestimonialProfile(user.realtorId),
    listOwnerTestimonials(user.realtorId),
  ]);
  return NextResponse.json({ profile, testimonials });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = testimonialProfileSchema.parse(await req.json());
  const profile = await updateTestimonialProfile(user.realtorId, {
    ...input,
    professional_title: nullableValue(input.professional_title),
    company: nullableValue(input.company),
    bio: nullableValue(input.bio),
    headshot_url: nullableValue(input.headshot_url),
  });
  return NextResponse.json({ profile });
});

export const POST = withErrorHandling(async () => {
  const user = await requireUser();
  const profile = await rotateCollectionToken(user.realtorId);
  return NextResponse.json({ profile });
});
