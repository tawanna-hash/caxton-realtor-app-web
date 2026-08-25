// app/api/admin/magazines/[id]/change-id/route.ts
//
// POST: renumber a magazine row (change primary key id). Also renumbers
// every child table that references magazines(id).
//
// This exists because the URL path /magazine/[id] uses the raw numeric
// id, so occasionally we want to move an issue to a specific number
// (e.g. to keep issue numbering aligned with print).
//
// Safety:
//   - Target id must be free (no existing magazine with that id).
//   - Runs inside a single transaction on Neon so a mid-update failure
//     leaves the DB consistent.
//   - Uses SET CONSTRAINTS ALL DEFERRED so the FK checks are only
//     enforced at commit time — the child UPDATEs and the parent UPDATE
//     can happen in any order within the txn without transient violations.
//
// Body: { "target_id": <int> }

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

async function isAdmin(): Promise<boolean> {
  try { return (await getCurrentAdmin()) !== null; } catch { return false; }
}
async function getAdminEmail(): Promise<string | null> {
  try { return (await getCurrentAdmin())?.email ?? null; } catch { return null; }
}
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail();

  const { id } = await ctx.params;
  const fromId = Number(id);
  if (!Number.isInteger(fromId) || fromId < 1) {
    return NextResponse.json({ error: 'invalid source id' }, { status: 400 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const targetId = Number((body as { target_id?: unknown })?.target_id);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return NextResponse.json({ error: 'target_id must be a positive integer' }, { status: 400 });
  }
  if (targetId === fromId) {
    return NextResponse.json({ error: 'target_id equals source id \u2014 nothing to do' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Preflight — source exists, target free.
    const src = await sql`SELECT id FROM magazines WHERE id = ${fromId}`;
    if (src.length === 0) {
      return NextResponse.json({ error: `magazine ${fromId} not found` }, { status: 404 });
    }
    const dst = await sql`SELECT id FROM magazines WHERE id = ${targetId}`;
    if (dst.length > 0) {
      return NextResponse.json(
        { error: `magazine ${targetId} already exists \u2014 pick a free id` },
        { status: 409 },
      );
    }

    // Neon HTTP driver: each sql`` is its own statement, but Neon's
    // pipelined `.transaction([...])` runs an atomic batch. Use it so
    // deferred FKs and every UPDATE commit together.
    const hotspotsUpd = sql`UPDATE magazine_hotspots SET magazine_id = ${targetId} WHERE magazine_id = ${fromId}`;
    const clicksUpd   = sql`UPDATE magazine_hotspot_clicks SET magazine_id = ${targetId} WHERE magazine_id = ${fromId}`;
    const magUpd      = sql`UPDATE magazines SET id = ${targetId} WHERE id = ${fromId}`;

    // sql.transaction wraps the batch in BEGIN ... COMMIT and rolls back
    // if any statement fails. DEFERRED constraints let us reorder freely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (sql as any).transaction(
      [
        sql`SET CONSTRAINTS ALL DEFERRED`,
        hotspotsUpd,
        clicksUpd,
        magUpd,
      ],
      { isolationLevel: 'Serializable' },
    );

    // results is an array of query results; count rows on the two child
    // updates by inspecting their rowCount when available.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rc = (r: any): number => (typeof r?.rowCount === 'number' ? r.rowCount : (Array.isArray(r) ? r.length : 0));
    const hotspotsMoved = rc(results[1]);
    const clicksMoved   = rc(results[2]);

    console.log(
      `[change-id] mag ${fromId} \u2192 ${targetId} by ${adminEmail} ` +
      `hotspots=${hotspotsMoved} clicks=${clicksMoved}`,
    );

    return NextResponse.json({
      ok: true,
      from_id: fromId,
      to_id: targetId,
      hotspots_moved: hotspotsMoved,
      clicks_moved: clicksMoved,
      new_url: `/magazine/${targetId}`,
    });
  } catch (err) {
    console.error('[change-id] failed:', errMessage(err));
    return NextResponse.json({ error: errMessage(err) }, { status: 500 });
  }
});
