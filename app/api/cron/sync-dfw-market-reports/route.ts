// Daily import of Dallas/Ft. Worth board market reports (see vercel.json).
//   Dallas    — MetroTex county + DFW Metroplex infographics (Gemini read)
//   Ft. Worth — GFWAR Zip Detail + Tarrant/Parker/Johnson county PDFs
// MetroTex graphics already stored for a month are skipped; pass
// ?force=1 to re-read them. Auth: Bearer CRON_SECRET (admin Run now uses
// the same path through /api/admin/scrapers/run).

import { importGfwarLatest } from '@/lib/server/gfwar-report-import';
import { importMetroTexMonth } from '@/lib/server/metrotex-report-import';
import { existingKeys, upsertDfwReports } from '@/lib/server/dfw-market-reports-store';
import { withScraperRun } from '@/lib/with-scraper-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function recentMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: 'cron_secret_missing' }, { status: 503 });
  if ((req.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const startedAt = Date.now();
  const deadline = startedAt + 240_000;

  try {
    const gf = await importGfwarLatest();
    const gfSaved = await upsertDfwReports(gf.reports);

    // Last month is usually published mid-month; also backfill the month before.
    const months = recentMonths(2);
    const have = await existingKeys('metrotex', months);
    const mt: Record<string, { saved: number; missing: string[]; failed: string[] }> = {};
    for (const month of months) {
      if (Date.now() > deadline) break;
      const r = await importMetroTexMonth(month, have, { force, deadline });
      mt[month] = { saved: await upsertDfwReports(r.reports), missing: r.missing, failed: r.failed };
    }
    const ms = Date.now() - startedAt;
    const mtSaved = Object.values(mt).reduce((a, b) => a + b.saved, 0);
    console.log(`[cron/sync-dfw-market-reports] ${ms}ms gfwar=${gfSaved} metrotex=${mtSaved}`);
    return Response.json({
      ok: true,
      received: gfSaved + mtSaved,
      gfwar: { saved: gfSaved, files: gf.files, errors: gf.errors },
      metrotex: mt,
      durationMs: ms,
    });
  } catch (err) {
    console.error('[cron/sync-dfw-market-reports] failed', err);
    return Response.json({ error: 'sync_failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = withScraperRun('sync-dfw-market-reports', _GET);
export const POST = GET;
