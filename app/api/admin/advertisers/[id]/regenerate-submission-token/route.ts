// app/api/admin/advertisers/[id]/regenerate-submission-token/route.ts
//
// POST /api/admin/advertisers/:id/regenerate-submission-token
//
// Issues (or rotates) the per-advertiser submission_token used by the
// public event submission form at /submit-event/[token].
//
// Calling this on an advertiser that already has a token invalidates the
// previous link — use that to revoke access if a token leaks.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { generateShareToken } from '@/lib/advertisers';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(_req: NextRequest, ctx: RouteCtx) {
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
    // generateShareToken returns 18 bytes base64url-encoded → 24 chars.
    // Re-using it keeps token entropy/format consistent across the app.
    const newToken = generateShareToken();
    const result = (await sql`
      UPDATE advertisers
      SET submission_token = ${newToken}, updated_at = NOW()
      WHERE id = ${idNum}
      RETURNING id, submission_token
    `) as unknown as { id: number; submission_token: string }[];

    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ submission_token: result[0].submission_token });
  } catch (err) {
    console.error(
      '[admin/advertisers/:id/regenerate-submission-token] failed:',
      errMessage(err),
    );
    return NextResponse.json(
      { error: 'regenerate failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
