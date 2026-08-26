import { NextResponse } from 'next/server';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { getPublicShowcase } from '@/lib/server/testimonials-store';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const { slug } = await ctx.params;
  const showcase = await getPublicShowcase(slug);
  if (!showcase) throw new ApiError(404, 'Testimonial showcase not found');
  captureServerEvent('testimonial_showcase_viewed', showcase.profile.realtor_id, {
    slug,
    testimonial_count: showcase.testimonials.length,
  });
  return NextResponse.json(showcase);
});
