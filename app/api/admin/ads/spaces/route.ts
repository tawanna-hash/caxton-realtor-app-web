/**
 * /api/admin/ads/spaces  GET — read-only catalog of ad spaces.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { listAdSpaces } from '@/lib/server/ads-store';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  const spaces = await listAdSpaces();
  return NextResponse.json({ spaces });
});
