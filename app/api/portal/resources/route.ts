// GET  /api/portal/resources?kind=  — list the signed-in partner's content
// POST /api/portal/resources        — create an item

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { RESOURCE_KINDS, resourceBodySchema } from '@/lib/portal-resources';
import { createRecord, listRecords } from '@/lib/server/portal-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  await ensureSchema();
  const kind = z.enum(RESOURCE_KINDS).parse(req.nextUrl.searchParams.get('kind'));
  const rows = await listRecords(user.advertiser_id, kind);
  return NextResponse.json({ items: rows });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  const raw = await req.json();
  const kind = z.enum(RESOURCE_KINDS).parse(raw?.kind);
  const body = resourceBodySchema.parse(raw);
  await ensureSchema();
  const item = await createRecord(user.advertiser_id, kind, body);
  return NextResponse.json({ item }, { status: 201 });
});
