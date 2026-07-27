/**
 * /api/admin/ads/spaces  GET — read-only catalog of ad spaces.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { listAdSpaces } from '@/lib/server/ads-store';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const spaces = await listAdSpaces();
  return NextResponse.json({ spaces });
});
