import { NextResponse } from 'next/server';
import { requirePlatinumUser } from '@/lib/server/auth/platinum';
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
  const user = await requirePlatinumUser();
  const [profile, testimonials] = await Promise.all([
    getOrCreateTestimonialProfile(user.realtorId),
    listOwnerTestimonials(user.realtorId),
  ]);
  return NextResponse.json({ profile, testimonials });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const user = await requirePlatinumUser();
  const input = testimonialProfileSchema.parse(await req.json());
  const profile = await updateTestimonialProfile(user.realtorId, {
    ...input,
    professional_title: nullableValue(input.professional_title),
    company: nullableValue(input.company),
    location: nullableValue(input.location),
    bio: nullableValue(input.bio),
    headshot_url: nullableValue(input.headshot_url),
    website_url: nullableValue(input.website_url),
    instagram_url: nullableValue(input.instagram_url),
    x_url: nullableValue(input.x_url),
    youtube_url: nullableValue(input.youtube_url),
    linkedin_url: nullableValue(input.linkedin_url),
  });
  return NextResponse.json({ profile });
});

export const POST = withErrorHandling(async () => {
  const user = await requirePlatinumUser();
  const profile = await rotateCollectionToken(user.realtorId);
  return NextResponse.json({ profile });
});
