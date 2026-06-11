// app/api/admin/advertisers/[id]/staff/route.ts
//
//   GET    — list all staff for an advertiser (with their assigned location_ids)
//   POST   — create a new staff member

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import type { AdvertiserStaff } from '@/lib/advertisers';
import { upsertStaffMailingByStaffId } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string }> };

type StaffRow = Omit<AdvertiserStaff, 'location_ids'>;

async function loadStaffWithLocations(idNum: number): Promise<AdvertiserStaff[]> {
  const sql = getSql();
  const staffRows = (await sql`
    SELECT * FROM advertiser_staff
    WHERE advertiser_id = ${idNum}
    ORDER BY sort_order ASC, created_at ASC
  `) as unknown as StaffRow[];
  if (staffRows.length === 0) return [];

  const ids = staffRows.map((r) => r.id);
  const joinRows = (await sql`
    SELECT staff_id, location_id
    FROM advertiser_staff_locations
    WHERE staff_id = ANY(${ids}::uuid[])
  `) as unknown as Array<{ staff_id: string; location_id: string }>;

  const map = new Map<string, string[]>();
  for (const r of joinRows) {
    const arr = map.get(r.staff_id) ?? [];
    arr.push(r.location_id);
    map.set(r.staff_id, arr);
  }
  return staffRows.map((s) => ({ ...s, location_ids: map.get(s.id) ?? [] }));
}

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
    const staff = await loadStaffWithLocations(idNum);
    return NextResponse.json({ staff });
  } catch (err) {
    console.error('[staff GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
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

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const str = (k: string): string | null => {
    const v = body[k];
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  };

  const locationIds: string[] = Array.isArray(body.location_ids)
    ? (body.location_ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))
    : [];

  try {
    await ensureSchema();
    const sql = getSql();
    const sortOrder = Number.isInteger(body.sort_order) ? Number(body.sort_order) : 0;

    const rows = (await sql`
      INSERT INTO advertiser_staff (
        advertiser_id, name, title, email, phone, photo_url, sort_order
      ) VALUES (
        ${idNum}, ${name}, ${str('title')}, ${str('email')}, ${str('phone')},
        ${str('photo_url')}, ${sortOrder}
      )
      RETURNING *
    `) as unknown as StaffRow[];

    const staff = rows[0];

    if (locationIds.length > 0) {
      // Filter to locations owned by this advertiser to prevent FK abuse
      const owned = (await sql`
        SELECT id FROM advertiser_locations
        WHERE advertiser_id = ${idNum} AND id = ANY(${locationIds}::uuid[])
      `) as unknown as Array<{ id: string }>;
      for (const { id: locId } of owned) {
        await sql`
          INSERT INTO advertiser_staff_locations (staff_id, location_id)
          VALUES (${staff.id}::uuid, ${locId}::uuid)
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // Best-effort: sync this staff member into the Advertisers mailing segment.
    try {
      await upsertStaffMailingByStaffId(staff.id);
    } catch (err) {
      console.warn('[staff POST] mailing upsert failed:', errMessage(err));
    }

    const enriched: AdvertiserStaff = { ...staff, location_ids: locationIds };
    return NextResponse.json({ staff: enriched }, { status: 201 });
  } catch (err) {
    console.error('[staff POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
}
