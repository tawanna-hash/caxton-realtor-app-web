// app/api/admin/advertisers/[id]/staff/[staffId]/route.ts
//
//   PATCH  — update staff fields and/or replace assigned location_ids
//   DELETE — remove a staff member

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import type { AdvertiserStaff } from '@/lib/advertisers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string; staffId: string }> };
type StaffRow = Omit<AdvertiserStaff, 'location_ids'>;

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, staffId } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!UUID_RE.test(staffId)) {
    return NextResponse.json({ error: 'invalid staff id' }, { status: 400 });
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
      SELECT id FROM advertiser_staff
      WHERE id = ${staffId}::uuid AND advertiser_id = ${idNum}
    `) as unknown as Array<{ id: string }>;
    if (owned.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    if ('name' in body) {
      const v = typeof body.name === 'string' ? body.name.trim() : '';
      if (!v) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      await sql`UPDATE advertiser_staff SET name = ${v} WHERE id = ${staffId}::uuid`;
    }

    const strFields = ['title', 'email', 'phone', 'photo_url'] as const;
    for (const k of strFields) {
      if (!(k in body)) continue;
      const raw = body[k];
      const v = raw === null ? null : typeof raw === 'string' ? (raw.trim() || null) : null;
      switch (k) {
        case 'title':     await sql`UPDATE advertiser_staff SET title = ${v}     WHERE id = ${staffId}::uuid`; break;
        case 'email':     await sql`UPDATE advertiser_staff SET email = ${v}     WHERE id = ${staffId}::uuid`; break;
        case 'phone':     await sql`UPDATE advertiser_staff SET phone = ${v}     WHERE id = ${staffId}::uuid`; break;
        case 'photo_url': await sql`UPDATE advertiser_staff SET photo_url = ${v} WHERE id = ${staffId}::uuid`; break;
      }
    }
    if ('sort_order' in body && Number.isInteger(body.sort_order)) {
      await sql`UPDATE advertiser_staff SET sort_order = ${Number(body.sort_order)} WHERE id = ${staffId}::uuid`;
    }

    // Replace location assignments wholesale when provided
    if ('location_ids' in body) {
      const requested: string[] = Array.isArray(body.location_ids)
        ? (body.location_ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))
        : [];

      await sql`DELETE FROM advertiser_staff_locations WHERE staff_id = ${staffId}::uuid`;

      if (requested.length > 0) {
        const owned = (await sql`
          SELECT id FROM advertiser_locations
          WHERE advertiser_id = ${idNum} AND id = ANY(${requested}::uuid[])
        `) as unknown as Array<{ id: string }>;
        for (const { id: locId } of owned) {
          await sql`
            INSERT INTO advertiser_staff_locations (staff_id, location_id)
            VALUES (${staffId}::uuid, ${locId}::uuid)
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    const staffRows = (await sql`SELECT * FROM advertiser_staff WHERE id = ${staffId}::uuid`) as unknown as StaffRow[];
    const locs = (await sql`
      SELECT location_id FROM advertiser_staff_locations WHERE staff_id = ${staffId}::uuid
    `) as unknown as Array<{ location_id: string }>;

    const enriched: AdvertiserStaff = {
      ...staffRows[0],
      location_ids: locs.map((r) => r.location_id),
    };
    return NextResponse.json({ staff: enriched });
  } catch (err) {
    console.error('[staff PATCH]', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, staffId } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!UUID_RE.test(staffId)) {
    return NextResponse.json({ error: 'invalid staff id' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const result = (await sql`
      DELETE FROM advertiser_staff
      WHERE id = ${staffId}::uuid AND advertiser_id = ${idNum}
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[staff DELETE]', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
