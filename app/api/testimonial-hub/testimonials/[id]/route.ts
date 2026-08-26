import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import {
  deleteOwnerTestimonial,
  updateOwnerTestimonial,
} from '@/lib/server/testimonials-store';
import { nullableValue, testimonialInputSchema } from '@/lib/testimonials';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const parsed = testimonialInputSchema.parse(await req.json());
  const testimonial = await updateOwnerTestimonial(id, user.realtorId, {
    ...parsed,
    clientTitle: nullableValue(parsed.clientTitle),
    clientCompany: nullableValue(parsed.clientCompany),
    videoUrl: nullableValue(parsed.videoUrl),
    imageUrl: nullableValue(parsed.imageUrl),
    transcript: nullableValue(parsed.transcript),
    sourceUrl: nullableValue(parsed.sourceUrl),
  });
  if (!testimonial) throw new ApiError(404, 'Testimonial not found');
  captureServerEvent('testimonial_updated', user.realtorId, {
    testimonial_id: id,
    status: testimonial.status,
  });
  return NextResponse.json({ testimonial });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const deleted = await deleteOwnerTestimonial(id, user.realtorId);
  if (!deleted) throw new ApiError(404, 'Testimonial not found');
  return NextResponse.json({ ok: true });
});
