// app/api/admin/advertisers/[id]/regenerate-token/route.ts
//
// POST /api/admin/advertisers/:id/regenerate-token
//
// Generates a new share_token for the advertiser, invalidating any
// previously-shared analytics URLs. Use when a stakeholder leaves the
// account or a token is accidentally exposed.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { generateShareToken } from '@/lib/advertisers';
import { getServerApiBase } from '@/lib/server-api-base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
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
    const newToken = generateShareToken();
    const result = (await sql`
      UPDATE advertisers
      SET share_token = ${newToken}, updated_at = NOW()
      WHERE id = ${idNum}
      RETURNING id, share_token
    `) as unknown as { id: number; share_token: string }[];

    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ share_token: result[0].share_token });
  } catch (err) {
    console.error('[admin/advertisers/:id/regenerate-token] failed:', errMessage(err));
    return NextResponse.json({ error: 'regenerate failed', detail: errMessage(err) }, { status: 500 });
  }
}
