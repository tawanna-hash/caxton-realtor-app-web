// PATCH / DELETE a single portal resource owned by the signed-in partner.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { resourceBodySchema } from '@/lib/portal-resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = withErrorHandling(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid id');
  const body = resourceBodySchema.parse(await req.json());
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE portal_resources
       SET title = ${body.title}, url = ${body.url ?? null}, notes = ${body.notes ?? null},
           fields = ${JSON.stringify(body.fields ?? {})}::jsonb,
           files = ${JSON.stringify(body.files ?? [])}::jsonb,
           updated_at = NOW()
     WHERE id = ${id} AND advertiser_id = ${user.advertiser_id}
     RETURNING *
  `;
  if (rows.length === 0) throw new ApiError(404, 'Not found');
  return NextResponse.json({ item: rows[0] });
});

export const DELETE = withErrorHandling(async (
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid id');
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM portal_resources WHERE id = ${id} AND advertiser_id = ${user.advertiser_id} RETURNING id`;
  if (rows.length === 0) throw new ApiError(404, 'Not found');
  return NextResponse.json({ ok: true });
});
