// PATCH / DELETE a single portal resource owned by the signed-in partner.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { z } from 'zod';
import { RESOURCE_KINDS, resourceBodySchema } from '@/lib/portal-resources';
import { deleteRecord, updateRecord } from '@/lib/server/portal-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^(primary-logo|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const PATCH = withErrorHandling(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) throw new ApiError(400, 'Invalid id');
  const raw = await req.json();
  const kind = z.enum(RESOURCE_KINDS).parse(raw?.kind);
  const body = resourceBodySchema.parse(raw);
  await ensureSchema();
  const item = await updateRecord(user.advertiser_id, kind, id, body);
  if (!item) throw new ApiError(404, 'Not found');
  return NextResponse.json({ item });
});

export const DELETE = withErrorHandling(async (
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) throw new ApiError(400, 'Invalid id');
  const kind = z.enum(RESOURCE_KINDS).parse(_req.nextUrl.searchParams.get('kind'));
  await ensureSchema();
  if (!(await deleteRecord(user.advertiser_id, kind, id))) throw new ApiError(404, 'Not found');
  return NextResponse.json({ ok: true });
});
