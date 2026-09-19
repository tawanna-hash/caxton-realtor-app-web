import { NextResponse } from 'next/server';
import { requirePlatinumUser } from '@/lib/server/auth/platinum';
import { withErrorHandling } from '@/lib/server/error';
import { createTestimonial } from '@/lib/server/testimonials-store';
import { nullableValue, testimonialInputSchema } from '@/lib/testimonials';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) => {
  const user = await requirePlatinumUser();
  const parsed = testimonialInputSchema.parse(await req.json());
  const testimonial = await createTestimonial(user.realtorId, {
    ...parsed,
    clientTitle: nullableValue(parsed.clientTitle),
    clientCompany: nullableValue(parsed.clientCompany),
    videoUrl: nullableValue(parsed.videoUrl),
    imageUrl: nullableValue(parsed.imageUrl),
    transcript: nullableValue(parsed.transcript),
    sourceUrl: nullableValue(parsed.sourceUrl),
  }, 'owner');
  captureServerEvent('testimonial_created', user.realtorId, {
    format: testimonial.format,
    status: testimonial.status,
    is_global: testimonial.is_global,
  });
  return NextResponse.json({ testimonial }, { status: 201 });
});
