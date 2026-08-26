import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { isPublicationId } from '@/lib/publications';
import { listAdminTestimonials, type TestimonialStatus } from '@/lib/server/testimonials-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const statusParam = req.nextUrl.searchParams.get('status');
  const marketParam = req.nextUrl.searchParams.get('market');
  const q = req.nextUrl.searchParams.get('q')?.trim() || undefined;
  const status = statusParam === 'pending' || statusParam === 'published' || statusParam === 'archived'
    ? statusParam as TestimonialStatus
    : undefined;
  const market = isPublicationId(marketParam) ? marketParam : undefined;
  const testimonials = await listAdminTestimonials({ status, market, q });
  const counts = testimonials.reduce((result, item) => {
    result[item.status] += 1;
    return result;
  }, { pending: 0, published: 0, archived: 0 });
  return NextResponse.json({ testimonials, counts });
});
