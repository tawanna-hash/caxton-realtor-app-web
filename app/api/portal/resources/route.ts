// GET  /api/portal/resources?kind=  — list the signed-in partner's content
// POST /api/portal/resources        — create an item

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { RESOURCE_KINDS, resourceBodySchema } from '@/lib/portal-resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  await ensureSchema();
  const sql = getSql();
  const kind = req.nextUrl.searchParams.get('kind');
  const rows = kind
    ? await sql`SELECT * FROM portal_resources WHERE advertiser_id = ${user.advertiser_id} AND kind = ${kind} ORDER BY created_at DESC`
    : await sql`SELECT * FROM portal_resources WHERE advertiser_id = ${user.advertiser_id} ORDER BY created_at DESC`;
  return NextResponse.json({ items: rows });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  const raw = await req.json();
  const kind = z.enum(RESOURCE_KINDS).parse(raw?.kind);
  const body = resourceBodySchema.parse(raw);
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO portal_resources (advertiser_id, kind, title, url, notes, fields, files)
    VALUES (${user.advertiser_id}, ${kind}, ${body.title}, ${body.url ?? null}, ${body.notes ?? null},
            ${JSON.stringify(body.fields ?? {})}::jsonb, ${JSON.stringify(body.files ?? [])}::jsonb)
    RETURNING *
  `;
  return NextResponse.json({ item: rows[0] }, { status: 201 });
});
