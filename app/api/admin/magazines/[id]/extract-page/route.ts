import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql } from '@/lib/db';
import { prepareHotspotScan, scanHotspotPage } from '@/lib/server/hotspot-scan';
import { withAdminTracking } from '@/lib/server/admin-tracking';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export const POST = withAdminTracking(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id = Number((await ctx.params).id);
    const { page_idx } = await req.json();
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(page_idx) || page_idx < 0) throw new Error('Invalid issue or page');
    const scan = await prepareHotspotScan(id);
    const diagnostics = await scanHotspotPage(scan, page_idx, admin.email);
    const sql = getSql();
    const [hotspots, scans] = await Promise.all([
      sql`SELECT * FROM magazine_hotspots WHERE magazine_id = ${id} ORDER BY page_idx, z_index, id`,
      sql`SELECT * FROM magazine_hotspot_scans WHERE magazine_id = ${id} ORDER BY page_idx`,
    ]);
    return NextResponse.json({ hotspots, scans, diagnostics });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Scan failed' }, { status: 400 });
  }
});
