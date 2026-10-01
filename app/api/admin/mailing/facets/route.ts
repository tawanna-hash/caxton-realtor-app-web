// app/api/admin/mailing/facets/route.ts
//
// GET /api/admin/mailing/facets?segment=<id|slug>&fields=county,license_type
//   → { facets: { county: [{ value, count }], ... } }
// Distinct values for the filter dropdowns on Mailing Hub list pages.

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { isMailingSegment, segmentFromSlug, mailingFacets, isFilterableField } from '@/lib/mailing';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const raw = url.searchParams.get('segment') ?? '';
  const segment = isMailingSegment(raw) ? raw : segmentFromSlug(raw);
  if (!segment) throw new ApiError(400, 'invalid segment');
  const fields = (url.searchParams.get('fields') ?? '')
    .split(',').map((f) => f.trim()).filter((f) => isFilterableField(f)).slice(0, 30);
  await ensureSchema();
  const facets = await mailingFacets(segment, fields);
  return NextResponse.json({ facets });
});
