// app/api/admin/advertisers/[id]/locations/[locationId]/route.ts
//
//   PATCH  — update a location
//   DELETE — remove a location

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { type AdvertiserLocation } from '@/lib/advertisers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string; locationId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, locationId } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!UUID_RE.test(locationId)) {
    return NextResponse.json({ error: 'invalid location id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Verify ownership
    const owned = (await sql`
      SELECT id FROM advertiser_locations
      WHERE id = ${locationId}::uuid AND advertiser_id = ${idNum}
    `) as unknown as Array<{ id: string }>;
    if (owned.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const strFields = ['label', 'address', 'address_2', 'city', 'state', 'zip', 'phone', 'email', 'hours'] as const;

    // If marking as primary, unset other primary rows first
    if ('is_primary' in body && body.is_primary === true) {
      await sql`UPDATE advertiser_locations SET is_primary = false WHERE advertiser_id = ${idNum}`;
    }

    for (const k of strFields) {
      if (!(k in body)) continue;
      const raw = body[k];
      const v = raw === null ? null : typeof raw === 'string' ? (raw.trim() || null) : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const col: any = k;
      // Use a switch to keep tagged templates safe (no dynamic identifiers)
      switch (col) {
        case 'label':     await sql`UPDATE advertiser_locations SET label = ${v}     WHERE id = ${locationId}::uuid`; break;
        case 'address':   await sql`UPDATE advertiser_locations SET address = ${v}   WHERE id = ${locationId}::uuid`; break;
        case 'address_2': await sql`UPDATE advertiser_locations SET address_2 = ${v} WHERE id = ${locationId}::uuid`; break;
        case 'city':      await sql`UPDATE advertiser_locations SET city = ${v}      WHERE id = ${locationId}::uuid`; break;
        case 'state':     await sql`UPDATE advertiser_locations SET state = ${v}     WHERE id = ${locationId}::uuid`; break;
        case 'zip':       await sql`UPDATE advertiser_locations SET zip = ${v}       WHERE id = ${locationId}::uuid`; break;
        case 'phone':     await sql`UPDATE advertiser_locations SET phone = ${v}     WHERE id = ${locationId}::uuid`; break;
        case 'email':     await sql`UPDATE advertiser_locations SET email = ${v}     WHERE id = ${locationId}::uuid`; break;
        case 'hours':     await sql`UPDATE advertiser_locations SET hours = ${v}     WHERE id = ${locationId}::uuid`; break;
      }
    }

    if ('is_primary' in body) {
      await sql`UPDATE advertiser_locations SET is_primary = ${!!body.is_primary} WHERE id = ${locationId}::uuid`;
    }
    if ('sort_order' in body && Number.isInteger(body.sort_order)) {
      await sql`UPDATE advertiser_locations SET sort_order = ${Number(body.sort_order)} WHERE id = ${locationId}::uuid`;
    }

    const rows = (await sql`SELECT * FROM advertiser_locations WHERE id = ${locationId}::uuid`) as unknown as AdvertiserLocation[];
    return NextResponse.json({ location: rows[0] });
  } catch (err) {
    console.error('[locations PATCH]', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, locationId } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!UUID_RE.test(locationId)) {
    return NextResponse.json({ error: 'invalid location id' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const result = (await sql`
      DELETE FROM advertiser_locations
      WHERE id = ${locationId}::uuid AND advertiser_id = ${idNum}
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[locations DELETE]', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
