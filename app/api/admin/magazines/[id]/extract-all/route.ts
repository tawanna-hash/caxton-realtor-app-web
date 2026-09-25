import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql } from '@/lib/db';
import { prepareHotspotScan, scanHotspotPage } from '@/lib/server/hotspot-scan';
import { withAdminTracking } from '@/lib/server/admin-tracking';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const POST = withAdminTracking(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid issue' }, { status: 400 });
  const encoder = new TextEncoder();
  let connected = true;
  const stream = new ReadableStream({
    cancel() { connected = false; },
    async start(controller) {
      const send = (value: unknown) => { if (connected) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); };
      try {
        const deadline = Date.now() + 190000;
        send({ type: 'preparing' });
        const scan = await prepareHotspotScan(id);
        send({ type: 'start', page_count: scan.pageCount });
        let cursor = 0, completed = 0, inserted = 0;
        const errors: string[] = [];
        // Bounded workers commit each page independently. Failed and unfinished
        // pages remain visible in the review checklist and can be retried.
        await Promise.all(Array.from({ length: Math.min(3, scan.pageCount) }, async () => {
          while (cursor < scan.pageCount && Date.now() < deadline) {
            const page = cursor++;
            try {
              const result = await scanHotspotPage(scan, page, admin.email);
              inserted += result.inserted; completed++;
              send({ type: 'page', ...result, completed, total: scan.pageCount });
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Scan failed';
              errors.push(`Page ${page + 1}: ${message}`);
              send({ type: 'page_error', page_idx: page, message });
            }
          }
        }));
        if (cursor < scan.pageCount) errors.push(`Time limit reached. Rescan remaining pages ${cursor + 1}–${scan.pageCount}.`);
        const sql = getSql();
        const [hotspots, scans] = await Promise.all([
          sql`SELECT * FROM magazine_hotspots WHERE magazine_id = ${id} ORDER BY page_idx, z_index, id`,
          sql`SELECT * FROM magazine_hotspot_scans WHERE magazine_id = ${id} ORDER BY page_idx`,
        ]);
        send({ type: 'done', hotspots, scans, errors, diagnostics: { inserted } });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Scan failed' });
      } finally { if (connected) controller.close(); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
});
