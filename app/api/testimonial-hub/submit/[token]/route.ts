import { NextResponse } from 'next/server';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import {
  createTestimonial,
  findProfileByToken,
} from '@/lib/server/testimonials-store';
import { nullableValue, publicTestimonialSubmissionSchema } from '@/lib/testimonials';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };
const recentSubmissions = new Map<string, number[]>();

function enforceRateLimit(token: string): void {
  const now = Date.now();
  const hits = (recentSubmissions.get(token) ?? []).filter((time) => now - time < 60_000);
  if (hits.length >= 5) throw new ApiError(429, 'Too many submissions. Please try again in a minute.');
  hits.push(now);
  recentSubmissions.set(token, hits);
}

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const profile = await findProfileByToken(token);
  if (!profile) throw new ApiError(404, 'Collection link not found');
  return NextResponse.json({
    profile: {
      display_name: profile.display_name,
      professional_title: profile.professional_title,
      company: profile.company,
      headshot_url: profile.headshot_url,
      website_url: profile.website_url,
    },
  });
});

export const POST = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  enforceRateLimit(token);
  const profile = await findProfileByToken(token);
  if (!profile) throw new ApiError(404, 'Collection link not found');
  const parsed = publicTestimonialSubmissionSchema.parse(await req.json());
  if (parsed.hp?.trim()) return NextResponse.json({ ok: true });

  const testimonial = await createTestimonial(profile.realtor_id, {
    ...parsed,
    clientTitle: nullableValue(parsed.clientTitle),
    clientCompany: nullableValue(parsed.clientCompany),
    videoUrl: nullableValue(parsed.videoUrl),
    imageUrl: nullableValue(parsed.imageUrl),
    transcript: nullableValue(parsed.transcript),
    sourceUrl: nullableValue(parsed.sourceUrl),
    markets: [],
    isGlobal: true,
    status: 'pending',
    sortOrder: 0,
  }, 'collection_link');
  captureServerEvent('testimonial_collection_submitted', profile.realtor_id, {
    testimonial_id: testimonial.id,
    format: testimonial.format,
  });
  return NextResponse.json({ ok: true, queued: true }, { status: 201 });
});
