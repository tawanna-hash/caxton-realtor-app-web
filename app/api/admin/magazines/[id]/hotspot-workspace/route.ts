import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureHotspotWorkspace } from '@/lib/server/hotspot-workspace';
import { getSql } from '@/lib/db';
import { isHotspotType, validatePosition, validateConfig, type Hotspot } from '@/lib/hotspots';
import { reviewProblem, reviewStatus } from '@/lib/hotspot-review';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid issue' }, { status: 400 });
  await ensureHotspotWorkspace();
  const sql = getSql();
  const [hotspots, scans] = await Promise.all([
    sql`SELECT * FROM magazine_hotspots WHERE magazine_id = ${id} ORDER BY page_idx, z_index, id`,
    sql`SELECT * FROM magazine_hotspot_scans WHERE magazine_id = ${id} ORDER BY page_idx`,
  ]);
  return NextResponse.json({ hotspots, scans });
}

/** Atomically applies a gesture/bulk action or its undo. Versions prevent lost edits across tabs. */
export const POST = withAdminTracking(async (req: NextRequest, ctx: Ctx) => {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid issue' }, { status: 400 });
  try {
    const body = await req.json();
    if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 2000) throw new Error('Choose between 1 and 2000 hotspots');
    await ensureHotspotWorkspace();
    const sql = getSql();
    const [mags, current] = await Promise.all([
      sql`SELECT page_count FROM magazines WHERE id = ${id}`,
      sql`SELECT * FROM magazine_hotspots WHERE magazine_id = ${id}`,
    ]);
    if (!mags.length) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    const rows = new Map((current as unknown as Hotspot[]).map(h => [Number(h.id), h]));
    const ids = new Set<number>();
    const changes = body.changes.map((change: { id: number; version: number; values: Partial<Hotspot> }) => {
      const cur = rows.get(Number(change.id));
      if (!cur || ids.has(Number(change.id))) throw new Error('Invalid or repeated hotspot');
      ids.add(Number(change.id));
      if (!Number.isInteger(change.version) || change.version !== (cur.editor_version || 0)) throw new Error('Conflict: another edit was saved. Reload before continuing.');
      const v = change.values;
      if (!v || typeof v !== 'object') throw new Error('Missing hotspot values');
      const next = { ...cur, ...v };
      if (!isHotspotType(next.type)) throw new Error('Invalid action');
      const pos = validatePosition(next.x_frac, next.y_frac, next.w_frac, next.h_frac);
      if (!pos.ok) throw new Error(pos.error);
      if (!Number.isInteger(next.page_idx) || next.page_idx < 0 || next.page_idx >= Number(mags[0].page_count)) throw new Error('Invalid page');
      const status = v.review_status ?? reviewStatus(cur);
      if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('Invalid review state');
      if (next.advertiser_id !== null && (!Number.isSafeInteger(next.advertiser_id) || next.advertiser_id <= 0)) throw new Error('Invalid partner');
      if (!Number.isInteger(next.z_index) || Math.abs(next.z_index) > 1000000) throw new Error('Invalid layer order');
      for (const key of ['editor_locked', 'editor_hidden', 'is_deleted', 'is_published'] as const) {
        if (v[key] !== undefined && typeof v[key] !== 'boolean') throw new Error(`Invalid ${key}`);
      }
      // Empty destinations are allowed in unreviewed drafts, never in approved/live rows.
      if (!next.config || next.config.type !== next.type) throw new Error('Invalid configuration');
      if (status === 'approved' || next.is_published) {
        const cfg = validateConfig(next.type, next.config);
        const problem = reviewProblem(next);
        if (!cfg.ok || problem) throw new Error(problem || (!cfg.ok ? cfg.error : 'Invalid destination'));
      }
      const published = next.is_published && status === 'approved' && !next.is_deleted;
      return {
        id: Number(cur.id), version: change.version,
        page_idx: next.page_idx, x: next.x_frac, y: next.y_frac, w: next.w_frac, h: next.h_frac,
        type: next.type, config: next.config, label: String(next.label || '').slice(0, 200) || null,
        advertiser_id: next.advertiser_id, advertiser_name: String(next.advertiser_name || '').slice(0, 200) || null,
        z_index: next.z_index, review_status: status,
        editor_locked: !!next.editor_locked, editor_hidden: !!next.editor_hidden,
        is_deleted: !!next.is_deleted, is_published: !!published,
      };
    });
    const updated = await sql`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS x(
          id BIGINT, version INTEGER, page_idx INTEGER, x DOUBLE PRECISION, y DOUBLE PRECISION,
          w DOUBLE PRECISION, h DOUBLE PRECISION, type TEXT, config JSONB, label TEXT,
          advertiser_id BIGINT, advertiser_name TEXT, z_index INTEGER, review_status TEXT,
          editor_locked BOOLEAN, editor_hidden BOOLEAN, is_deleted BOOLEAN, is_published BOOLEAN
        )
      ), locked AS MATERIALIZED (
        SELECT h.id, h.editor_version FROM magazine_hotspots h
        JOIN incoming i ON i.id = h.id WHERE h.magazine_id = ${id} ORDER BY h.id FOR UPDATE OF h
      ), valid AS (
        SELECT COUNT(*) = ${changes.length} AND BOOL_AND(l.editor_version = i.version) AS ok
        FROM incoming i JOIN locked l ON l.id = i.id
      )
      UPDATE magazine_hotspots h SET
        page_idx = i.page_idx, x_frac = i.x, y_frac = i.y, w_frac = i.w, h_frac = i.h,
        type = i.type, config = i.config, label = i.label, advertiser_id = i.advertiser_id,
        advertiser_name = i.advertiser_name, z_index = i.z_index, review_status = i.review_status,
        editor_locked = i.editor_locked, editor_hidden = i.editor_hidden, is_deleted = i.is_deleted,
        is_published = i.is_published, source = 'manual',
        editor_version = h.editor_version + 1, updated_by = ${admin.email}, updated_at = NOW()
      FROM incoming i, valid v WHERE h.id = i.id AND h.magazine_id = ${id} AND v.ok
      RETURNING h.*`;
    if (updated.length !== changes.length) return NextResponse.json({ error: 'Another edit was saved. Reload to prevent overwriting it.' }, { status: 409 });
    return NextResponse.json({ hotspots: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 400 });
  }
});
