// app/api/admin/magazines/[id]/hotspots-dedupe/route.ts
//
// POST: find duplicate hotspots within each page of this magazine (same
// normalized identity — URL host+path, email, or phone digits) and delete
// all but one per (page_idx, type, identity) group.
//
// The keeper is chosen deterministically:
//   1. Prefer published rows over drafts (a human already vetted it).
//   2. Prefer manual source over pdf_import (hand-drawn wins).
//   3. Prefer human-edited imports (source='pdf_import' AND was_imported
//      AND updated_at > created_at) over untouched imports.
//   4. Prefer larger bbox area (usually the more visible hotspot).
//   5. Tiebreak on lowest id (oldest row).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureHotspotWorkspace } from '@/lib/server/hotspot-workspace';
import { destinationIdentity, samePlacement } from '@/lib/hotspot-review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

async function isAdmin(): Promise<boolean> {
  try {
    return (await getCurrentAdmin()) !== null;
  } catch { return false; }
}

async function getAdminEmail(): Promise<string | null> {
  try {
    const admin = await getCurrentAdmin();
    return admin?.email ?? null;
  } catch { return null; }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function identityFor(type: string, config: Record<string, unknown>): string | null {
  return ['link', 'mls', 'email', 'phone'].includes(type) ? destinationIdentity(config as Hotspot['config']) || null : null;
}

interface HotspotRow {
  id: number;
  page_idx: number;
  type: string;
  config: Record<string, unknown>;
  is_published: boolean;
  source: string;
  was_imported: boolean;
  w_frac: number;
  h_frac: number;
  x_frac: number;
  y_frac: number;
  editor_version: number;
  created_at: string;
  updated_at: string;
}

/** Higher score wins as the keeper. */
function keeperScore(r: HotspotRow): number {
  let s = 0;
  if (r.is_published) s += 10000;
  if (r.source === 'manual') s += 1000;
  if (r.was_imported && r.updated_at && r.created_at && r.updated_at > r.created_at) s += 100;
  // Area contributes at most ~1 point (frac0-1 * frac0-1) — pure tiebreaker.
  s += (r.w_frac || 0) * (r.h_frac || 0);
  return s;
}

export const POST = withAdminTracking(async function POST(_req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail();

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    await ensureSchema();
    await ensureHotspotWorkspace();
    const sql = getSql();

    const rows = (await sql`
      SELECT id, page_idx, type, config, is_published, source, was_imported,
             x_frac, y_frac, w_frac, h_frac, created_at, updated_at, editor_version
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
        AND is_deleted = false AND COALESCE(review_status, 'pending') != 'rejected'
    `) as unknown as HotspotRow[];

    // Group by (page_idx, type, identity).
    const groups = new Map<string, HotspotRow[]>();
    for (const r of rows) {
      const ident = identityFor(r.type, r.config);
      if (!ident) continue; // Anchors, images etc. have no identity — leave alone.
      const key = `${r.page_idx}:${r.type}:${ident}`;
      const list = groups.get(key);
      if (list) list.push(r);
      else groups.set(key, [r]);
    }

    const toDelete: number[] = [];
    let groupsWithDupes = 0;
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      groupsWithDupes++;
      list.sort((a, b) => {
        const sb = keeperScore(b) - keeperScore(a);
        if (sb !== 0) return sb;
        return a.id - b.id; // oldest id wins ties
      });
      const kept: HotspotRow[] = [];
      for (const row of list) {
        if (kept.some(keeper => samePlacement(keeper, row))) toDelete.push(row.id);
        else kept.push(row);
      }
    }

    if (toDelete.length > 0) {
      const versions = rows.filter(r => toDelete.includes(r.id)).map(r => ({ id: r.id, version: r.editor_version }));
      await sql`UPDATE magazine_hotspots h SET is_deleted = true, is_published = false,
        editor_version = h.editor_version + 1, updated_by = ${adminEmail}, updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(versions)}::jsonb) AS v(id BIGINT, version INTEGER)
        WHERE h.id = v.id AND h.editor_version = v.version AND h.magazine_id = ${idNum}`;
    }

    const all = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name, advertiser_id,
             is_published, source, was_imported, z_index,
             created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
        AND is_deleted = false
      ORDER BY page_idx, z_index, id
    `) as unknown as Hotspot[];

    console.log(
      `[hotspots-dedupe] mag=${idNum} scanned=${rows.length} groups=${groups.size} ` +
      `dupe_groups=${groupsWithDupes} deleted=${toDelete.length} by=${adminEmail}`,
    );

    return NextResponse.json({
      ok: true,
      scanned: rows.length,
      dupe_groups: groupsWithDupes,
      deleted: toDelete.length,
      hotspots: all,
    });
  } catch (err) {
    console.error('[hotspots-dedupe] failed:', errMessage(err));
    return NextResponse.json({ error: errMessage(err) }, { status: 500 });
  }
});
