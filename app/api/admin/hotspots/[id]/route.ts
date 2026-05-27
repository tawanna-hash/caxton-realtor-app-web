// app/api/admin/hotspots/[id]/route.ts
//
// Admin PATCH: update a hotspot (position, config, publish state, etc.)
// Admin DELETE: delete a hotspot.
// Same auth pattern as the rest of /api/admin/*.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  isHotspotType,
  validatePosition,
  validateConfig,
  type Hotspot,
  type HotspotType,
} from '@/lib/hotspots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

type RouteCtx = { params: Promise<{ id: string }> };

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function getAdminEmail(cookieHeader: string | null): Promise<string | null> {
  if (!cookieHeader) return null;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (typeof data?.email === 'string' ? data.email : null);
  } catch {
    return null;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail(cookieHeader);

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: {
    x?: number; y?: number; w?: number; h?: number;
    type?: string;
    config?: unknown;
    label?: string | null;
    advertiser_name?: string | null;
    is_published?: boolean;
    page_idx?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Load current row to merge against.
    const existing = (await sql`
      SELECT id, magazine_id, page_idx, x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name, is_published
      FROM magazine_hotspots WHERE id = ${idNum}
    `) as unknown as Hotspot[];
    if (existing.length === 0) {
      return NextResponse.json({ error: 'hotspot not found' }, { status: 404 });
    }
    const cur = existing[0];

    // Resolve incoming-or-current values, validating any that change.
    const nextType: HotspotType = body.type !== undefined
      ? (isHotspotType(body.type) ? body.type : (() => { throw new Error('invalid type'); })())
      : cur.type;

    const wantsPosUpdate =
      body.x !== undefined || body.y !== undefined ||
      body.w !== undefined || body.h !== undefined;
    let nx = cur.x_frac, ny = cur.y_frac, nw = cur.w_frac, nh = cur.h_frac;
    if (wantsPosUpdate) {
      const posCheck = validatePosition(
        body.x ?? cur.x_frac, body.y ?? cur.y_frac,
        body.w ?? cur.w_frac, body.h ?? cur.h_frac,
      );
      if (!posCheck.ok) return NextResponse.json({ error: posCheck.error }, { status: 400 });
      ({ x: nx, y: ny, w: nw, h: nh } = posCheck.values);
    }

    let nextConfig: unknown = cur.config;
    if (body.config !== undefined) {
      const cfgCheck = validateConfig(nextType, body.config);
      if (!cfgCheck.ok) return NextResponse.json({ error: cfgCheck.error }, { status: 400 });
      nextConfig = body.config;
    } else if (body.type !== undefined && body.type !== cur.type) {
      // Type changed but no new config — must re-validate the old config against the new type.
      const cfgCheck = validateConfig(nextType, cur.config);
      if (!cfgCheck.ok) {
        return NextResponse.json({
          error: `existing config does not match new type ${nextType}: ${cfgCheck.error}`,
        }, { status: 400 });
      }
    }

    const nextLabel = body.label === undefined
      ? cur.label
      : (body.label === null ? null : String(body.label).trim().slice(0, 200) || null);
    const nextAdv = body.advertiser_name === undefined
      ? cur.advertiser_name
      : (body.advertiser_name === null ? null : String(body.advertiser_name).trim().slice(0, 200) || null);
    const nextPublished = body.is_published === undefined ? cur.is_published : !!body.is_published;
    const nextPageIdx = body.page_idx === undefined
      ? cur.page_idx
      : (Number.isInteger(body.page_idx) && (body.page_idx as number) >= 0
          ? (body.page_idx as number)
          : (() => { throw new Error('invalid page_idx'); })());

    const rows = (await sql`
      UPDATE magazine_hotspots SET
        page_idx = ${nextPageIdx},
        x_frac = ${nx}, y_frac = ${ny}, w_frac = ${nw}, h_frac = ${nh},
        type = ${nextType},
        config = ${JSON.stringify(nextConfig)}::jsonb,
        label = ${nextLabel},
        advertiser_name = ${nextAdv},
        is_published = ${nextPublished},
        updated_by = ${adminEmail},
        updated_at = NOW()
      WHERE id = ${idNum}
      RETURNING id, magazine_id, page_idx,
                x_frac, y_frac, w_frac, h_frac,
                type, config, label, advertiser_name,
                is_published, created_by, created_at, updated_by, updated_at
    `) as unknown as Hotspot[];
    return NextResponse.json({ hotspot: rows[0] });
  } catch (err: unknown) {
    console.error('[admin/hotspots PATCH] failed:', errMessage(err));
    return NextResponse.json({ error: errMessage(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    const result = (await sql`
      DELETE FROM magazine_hotspots WHERE id = ${idNum} RETURNING id
    `) as unknown as Array<{ id: number }>;
    if (result.length === 0) {
      return NextResponse.json({ error: 'hotspot not found' }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    console.error('[admin/hotspots DELETE] failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
