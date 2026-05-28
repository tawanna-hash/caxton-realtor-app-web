// app/api/admin/hotspots/[id]/route.ts
//
// Admin PATCH: update a hotspot (position, config, publish state, etc.)
// Admin DELETE: delete a hotspot.
// Same auth pattern as the rest of /api/admin/*.
//
// Phase 6: accepts and updates `advertiser_id`. Setting it to null
// explicitly clears the link; omitting it leaves the current value alone.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  isHotspotType,
  validatePosition,
  validateConfig,
  type Hotspot,
  type HotspotType,
} from '@/lib/hotspots';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

async function getAdminEmail(): Promise<string | null> {
  try {
    const admin = await getCurrentAdmin();
    return admin?.email ?? null;
  } catch {
    return null;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail();

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
    advertiser_id?: number | null;
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
             type, config, label, advertiser_name, advertiser_id, is_published
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
    // Phase 6: advertiser_id. `undefined` = leave alone; `null` = clear link;
    // positive integer = set link. Postgres FK enforces validity.
    const nextAdvId: number | null = body.advertiser_id === undefined
      ? cur.advertiser_id
      : (body.advertiser_id === null
          ? null
          : (typeof body.advertiser_id === 'number' && Number.isInteger(body.advertiser_id) && body.advertiser_id > 0
              ? body.advertiser_id
              : null));
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
        advertiser_id = ${nextAdvId},
        is_published = ${nextPublished},
        updated_by = ${adminEmail},
        updated_at = NOW()
      WHERE id = ${idNum}
      RETURNING id, magazine_id, page_idx,
                x_frac, y_frac, w_frac, h_frac,
                type, config, label, advertiser_name, advertiser_id,
                is_published, created_by, created_at, updated_by, updated_at
    `) as unknown as Hotspot[];
    return NextResponse.json({ hotspot: rows[0] });
  } catch (err: unknown) {
    console.error('[admin/hotspots PATCH] failed:', errMessage(err));
    return NextResponse.json({ error: errMessage(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
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
