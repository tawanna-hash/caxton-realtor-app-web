// app/api/admin/magazines/[id]/hotspots-publish-all/route.ts
//
// POST: flip every draft hotspot on this magazine to is_published=true.
// Used by the "Publish all drafts" banner button.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';
import { getServerApiBase } from '@/lib/server-api-base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const API_URL = await getServerApiBase();
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

async function getAdminEmail(cookieHeader: string | null): Promise<string | null> {
  if (!cookieHeader) return null;
  try {
    const API_URL = await getServerApiBase();
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = await r.json();
    return typeof data?.email === 'string' ? data.email : null;
  } catch { return null; }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
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

  try {
    await ensureSchema();
    const sql = getSql();

    await sql`
      UPDATE magazine_hotspots
      SET is_published = true,
          updated_by = ${adminEmail},
          updated_at = NOW()
      WHERE magazine_id = ${idNum} AND is_published = false
    `;

    const all = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name,
             is_published, created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
      ORDER BY page_idx, id
    `) as unknown as Hotspot[];

    return NextResponse.json({ hotspots: all });
  } catch (err) {
    console.error('[admin/hotspots-publish-all] failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
