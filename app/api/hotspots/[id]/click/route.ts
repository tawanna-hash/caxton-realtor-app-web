// app/api/hotspots/[id]/click/route.ts
//
// Public POST: records a click on a hotspot. No auth — we want anonymous
// tracking for advertiser performance reports. Session ID comes from the
// client (a random UUID stored in a long-lived cookie); user_agent and
// referrer are picked up from request headers.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const hotspotId = Number(id);
  if (!Number.isInteger(hotspotId) || hotspotId < 1) {
    return NextResponse.json({ error: 'invalid hotspot id' }, { status: 400 });
  }

  // session_id is the only required field. Cap length to prevent DB abuse.
  let body: { session_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const sessionId = String(body.session_id ?? '').slice(0, 128).trim();
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const userAgent = (req.headers.get('user-agent') || '').slice(0, 512) || null;
  const referrer = (req.headers.get('referer') || '').slice(0, 512) || null;

  try {
    await ensureSchema();
    const sql = getSql();
    // Look up the hotspot to capture magazine_id + page_idx denormalized,
    // and verify it actually exists (don't accept clicks for ghost hotspots).
    const rows = (await sql`
      SELECT magazine_id, page_idx
      FROM magazine_hotspots
      WHERE id = ${hotspotId} AND is_published = true
      LIMIT 1
    `) as unknown as Array<{ magazine_id: number; page_idx: number }>;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'hotspot not found' }, { status: 404 });
    }
    const { magazine_id, page_idx } = rows[0];

    await sql`
      INSERT INTO magazine_hotspot_clicks (
        hotspot_id, magazine_id, page_idx, session_id, user_agent, referrer
      ) VALUES (
        ${hotspotId}, ${magazine_id}, ${page_idx}, ${sessionId}, ${userAgent}, ${referrer}
      )
    `;
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    console.error('[api/hotspots/[id]/click] insert failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
