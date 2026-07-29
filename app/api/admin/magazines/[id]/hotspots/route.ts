// app/api/admin/magazines/[id]/hotspots/route.ts
//
// Admin POST: creates a hotspot on a magazine.
// Admin GET: lists all hotspots on a magazine (including drafts).
// Mirrors the auth pattern in app/api/admin/magazines/route.ts —
// session cookie is forwarded to the back-end API's /admin/auth/me.
//
// Phase 6: accepts and persists `advertiser_id` so the hotspot editor
// can link directly to an advertisers row without waiting for the
// name-matching backfill.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  isHotspotType,
  validatePosition,
  validateConfig,
  type Hotspot,
} from '@/lib/hotspots';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

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

export async function GET(req: NextRequest, ctx: RouteCtx) {
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
    const rows = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name, advertiser_id,
             is_published, created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
      ORDER BY page_idx, id
    `) as unknown as Hotspot[];
    return NextResponse.json({ hotspots: rows });
  } catch (err: unknown) {
    console.error('[admin/hotspots GET] query failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail();

  const { id } = await ctx.params;
  const magazineId = Number(id);
  if (!Number.isInteger(magazineId) || magazineId < 1) {
    return NextResponse.json({ error: 'invalid magazine id' }, { status: 400 });
  }

  let body: {
    page_idx?: number;
    x?: number; y?: number; w?: number; h?: number;
    type?: string;
    config?: unknown;
    label?: string;
    advertiser_name?: string;
    advertiser_id?: number | null;
    is_published?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const pageIdx = Number(body.page_idx);
  if (!Number.isInteger(pageIdx) || pageIdx < 0) {
    return NextResponse.json({ error: 'page_idx required' }, { status: 400 });
  }

  const posCheck = validatePosition(body.x, body.y, body.w, body.h);
  if (!posCheck.ok) {
    return NextResponse.json({ error: posCheck.error }, { status: 400 });
  }
  const { x, y, w, h } = posCheck.values;

  if (!isHotspotType(body.type)) {
    return NextResponse.json({ error: 'invalid hotspot type' }, { status: 400 });
  }
  const type = body.type;

  const cfgCheck = validateConfig(type, body.config);
  if (!cfgCheck.ok) {
    return NextResponse.json({ error: cfgCheck.error }, { status: 400 });
  }

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 200) || null : null;
  const advertiserName = typeof body.advertiser_name === 'string'
    ? body.advertiser_name.trim().slice(0, 200) || null
    : null;
  // Phase 6: advertiser_id is null OR a positive integer pointing at an
  // existing advertisers row. We trust the Postgres FK constraint to
  // reject bad ids rather than doing a SELECT first.
  const advertiserId: number | null = (() => {
    const v = body.advertiser_id;
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return null;
    return v;
  })();
  const isPublished = body.is_published === true;

  try {
    await ensureSchema();
    const sql = getSql();
    // Confirm magazine exists before creating the hotspot.
    const mag = await sql`SELECT id, page_count FROM magazines WHERE id = ${magazineId}`;
    if (mag.length === 0) {
      return NextResponse.json({ error: 'magazine not found' }, { status: 404 });
    }
    const pageCount = Number(mag[0].page_count);
    if (Number.isInteger(pageCount) && pageCount > 0 && pageIdx >= pageCount) {
      return NextResponse.json({ error: `page_idx ${pageIdx} exceeds page_count ${pageCount}` }, { status: 400 });
    }

    const rows = (await sql`
      INSERT INTO magazine_hotspots (
        magazine_id, page_idx, x_frac, y_frac, w_frac, h_frac,
        type, config, label, advertiser_name, advertiser_id, is_published,
        created_by, updated_by
      ) VALUES (
        ${magazineId}, ${pageIdx}, ${x}, ${y}, ${w}, ${h},
        ${type}, ${JSON.stringify(body.config)}::jsonb,
        ${label}, ${advertiserName}, ${advertiserId}, ${isPublished},
        ${adminEmail}, ${adminEmail}
      )
      RETURNING id, magazine_id, page_idx,
                x_frac, y_frac, w_frac, h_frac,
                type, config, label, advertiser_name, advertiser_id,
                is_published, created_by, created_at, updated_by, updated_at
    `) as unknown as Hotspot[];
    return NextResponse.json({ hotspot: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    console.error('[admin/hotspots POST] insert failed:', errMessage(err));
    return NextResponse.json(
      { error: 'database error', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
