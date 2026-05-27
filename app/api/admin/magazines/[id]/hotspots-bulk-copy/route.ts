// app/api/admin/magazines/[id]/hotspots-bulk-copy/route.ts
//
// POST: copy all (or only published) hotspots from source_magazine_id
// into magazine [id]. Copies come in as DRAFTS (is_published=false) so
// the admin can review URLs that may have changed between issues.
// Returns the full updated hotspot list for the destination magazine.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';

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
  const destId = Number(id);
  if (!Number.isInteger(destId) || destId < 1) {
    return NextResponse.json({ error: 'invalid destination magazine id' }, { status: 400 });
  }

  let body: { source_magazine_id?: number; published_only?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const sourceId = Number(body.source_magazine_id);
  if (!Number.isInteger(sourceId) || sourceId < 1) {
    return NextResponse.json({ error: 'invalid source_magazine_id' }, { status: 400 });
  }
  if (sourceId === destId) {
    return NextResponse.json({ error: 'source and destination must differ' }, { status: 400 });
  }
  const publishedOnly = body.published_only !== false; // default to true

  try {
    await ensureSchema();
    const sql = getSql();

    // Verify both magazines exist.
    const mags = await sql`
      SELECT id, page_count FROM magazines WHERE id IN (${sourceId}, ${destId})
    `;
    if (mags.length < 2) {
      return NextResponse.json({ error: 'source or destination magazine not found' }, { status: 404 });
    }
    const destPageCount = Number(mags.find((m) => m.id === destId)?.page_count) || 0;

    // Copy: select from source, insert into dest. New rows always start as drafts.
    // Filter out any hotspots whose page_idx is past the destination's page count.
    const copied = (await sql`
      INSERT INTO magazine_hotspots (
        magazine_id, page_idx,
        x_frac, y_frac, w_frac, h_frac,
        type, config, label, advertiser_name,
        is_published, created_by, updated_by
      )
      SELECT
        ${destId}, page_idx,
        x_frac, y_frac, w_frac, h_frac,
        type, config, label, advertiser_name,
        false, ${adminEmail}, ${adminEmail}
      FROM magazine_hotspots
      WHERE magazine_id = ${sourceId}
        AND (${publishedOnly}::boolean = false OR is_published = true)
        AND (${destPageCount}::int = 0 OR page_idx < ${destPageCount}::int)
      RETURNING id
    `) as unknown as Array<{ id: number }>;

    // Return updated full list for the destination.
    const all = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name,
             is_published, created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${destId}
      ORDER BY page_idx, id
    `) as unknown as Hotspot[];

    return NextResponse.json({ hotspots: all, copied_count: copied.length });
  } catch (err) {
    console.error('[admin/hotspots-bulk-copy] failed:', errMessage(err));
    return NextResponse.json({ error: 'database error', detail: errMessage(err) }, { status: 500 });
  }
}
