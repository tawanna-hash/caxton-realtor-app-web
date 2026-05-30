// app/api/admin/mailing/sync-realtors/route.ts
//
// POST — admin-session entry point for the UnlockMLS realtor scraper.
// Runs a bounded sync (maxRecords default 2000) and upserts every
// returned agent into the holding-stage mailing table. The same job
// runs unattended via /api/cron/scrape-abor-realtors.
//
//   POST /api/admin/mailing/sync-realtors
//   Optional body: { maxRecords?: number; maxPages?: number; aorFilter?: string; cityFilter?: string }

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { scrapeAborRealtors } from '@/lib/abor-realtor-scraper';
import { upsertHoldingContacts } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — scraper can take a while

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json() as Record<string, unknown>; } catch { /* empty body ok */ }

  const maxRecords = typeof body.maxRecords === 'number' && body.maxRecords > 0
    ? Math.min(body.maxRecords, 20000)
    : 2000;
  const maxPages = typeof body.maxPages === 'number' && body.maxPages > 0
    ? Math.min(body.maxPages, 60)
    : undefined;
  const aorFilter = typeof body.aorFilter === 'string' ? body.aorFilter : undefined;
  const cityFilter = typeof body.cityFilter === 'string' ? body.cityFilter : undefined;

  try {
    await ensureSchema();
    const started = Date.now();
    const { records, pagesScraped, totalReportedByServer, truncated } = await scrapeAborRealtors({
      maxRecords,
      maxPages,
      aorFilter,
      cityFilter: cityFilter ? [cityFilter] : undefined,
    });
    const upsert = await upsertHoldingContacts(
      records.map((r) => ({
        external_id: r.external_id,
        external_source: r.external_source,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        company: r.company,
        title: r.title,
        license_number: r.license_number,
        address: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        segment: 'realtor',
        source: 'unlockmls',
      })),
    );
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      scraped: records.length,
      pagesScraped,
      totalReportedByServer,
      truncated,
      ...upsert,
    });
  } catch (err) {
    console.error('[admin/mailing/sync-realtors]', errMessage(err));
    return NextResponse.json({ error: 'sync failed', detail: errMessage(err) }, { status: 500 });
  }
}
