// app/api/admin/advertisers/[id]/locations/route.ts
//
//   GET    — list all locations for an advertiser
//   POST   — create a new location

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { type AdvertiserLocation } from '@/lib/advertisers';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM advertiser_locations
      WHERE advertiser_id = ${idNum}
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC
    `) as unknown as AdvertiserLocation[];
    return NextResponse.json({ locations: rows });
  } catch (err) {
    console.error('[locations GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const str = (k: string): string | null => {
    const v = body[k];
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  };

  try {
    await ensureSchema();
    const sql = getSql();

    const isPrimary = !!body.is_primary;
    const sortOrder = Number.isInteger(body.sort_order) ? Number(body.sort_order) : 0;

    // If marking as primary, unset other primary rows first
    if (isPrimary) {
      await sql`UPDATE advertiser_locations SET is_primary = false WHERE advertiser_id = ${idNum}`;
    }

    const rows = (await sql`
      INSERT INTO advertiser_locations (
        advertiser_id, label, address, address_2, city, state, zip,
        phone, email, hours, is_primary, sort_order
      ) VALUES (
        ${idNum}, ${str('label')}, ${str('address')}, ${str('address_2')},
        ${str('city')}, ${str('state')}, ${str('zip')},
        ${str('phone')}, ${str('email')}, ${str('hours')},
        ${isPrimary}, ${sortOrder}
      )
      RETURNING *
    `) as unknown as AdvertiserLocation[];

    return NextResponse.json({ location: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('[locations POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
});

