import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ApiError } from '@/lib/server/error';
import {
  deleteAdminTestimonial,
  updateAdminTestimonial,
} from '@/lib/server/testimonials-store';
import { adminTestimonialPatchSchema } from '@/lib/testimonials';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const parsed = adminTestimonialPatchSchema.parse(await req.json());
  const testimonial = await updateAdminTestimonial(id, parsed);
  if (!testimonial) throw new ApiError(404, 'Testimonial not found');
  captureServerEvent('testimonial_moderated', admin.email, {
    testimonial_id: id,
    status: testimonial.status,
  });
  return NextResponse.json({ testimonial });
});

export const DELETE = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const deleted = await deleteAdminTestimonial(id);
  if (!deleted) throw new ApiError(404, 'Testimonial not found');
  return NextResponse.json({ ok: true });
});
