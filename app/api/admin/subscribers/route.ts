/**
 * /api/admin/subscribers  GET — paginated list with optional market + search filters.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { listSubscribers } from '@/lib/server/subscribers-store';
import { listSubscribersQuerySchema } from '@/lib/server/schemas/subscribers';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const parsed = listSubscribersQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ApiError(400, 'invalid_query', parsed.error.message);

  const result = await listSubscribers(parsed.data);
  return NextResponse.json(result);
});
