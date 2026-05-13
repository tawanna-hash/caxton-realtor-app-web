// app/api/cron/scrape-kb-home/route.ts
//
// Vercel Cron endpoint. Runs daily, fetches KB Home Austin communities
// by enumerating their sitemap and scraping per-community HTML pages,
// and upserts each into builder_inventory keyed on (builder_name, external_id).
//
// Auth: in production we require `Authorization: Bearer ${CRON_SECRET}`,
// which Vercel automatically attaches to scheduled invocations when the
// CRON_SECRET env var is set. In dev/preview we allow unauthenticated
// access for testing.
//
// Behavior on upsert: identical to scrape-mi-homes — NEW rows insert as
// status='pending', existing rows update data-driven fields only (status,
// featured, reviewedBy, reviewedAt are admin-owned and untouched).
//
// Errors:
//   - Sitemap fetch failure or zero Austin URLs: returns 500.
//   - Per-row failure during upsert: logs and continues with the rest.
//   - Per-community fetch/parse failure: handled inside the scraper, counted
//     as `skipped`, does not abort the run.

import { NextRequest, NextResponse } from 'next/server';
import { fetchKBHomesAustin } from '@/lib/scrapers/kb-home';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sitemap + 12 community fetches = 13 sequential HTTP calls. ~500ms each on
// happy path = ~6.5s. Allowing 60s gives headroom for Neon cold starts and
// the occasional slow KB response.
export const maxDuration = 60;

const SCRAPER_SUBMITTER_NAME = 'KB Home Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-kb-home@harmonyone.system';

function verifyCronAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');

  if (!isProduction) {
    return { ok: true };
  }

  if (!expected) {
    return { ok: false, reason: 'CRON_SECRET not configured' };
  }
  if (got !== `Bearer ${expected}`) {
    return { ok: false, reason: 'Bad or missing Authorization header' };
  }
  return { ok: true };
}

async function runScrape() {
  const startedAt = Date.now();
  const { rows, rawCount, skipped } = await fetchKBHomesAustin();

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: { title: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId({
        externalId: row.externalId,
        kind: 'listing',
        publication: 'realtyline',
        submittedByName: SCRAPER_SUBMITTER_NAME,
        submittedByEmail: SCRAPER_SUBMITTER_EMAIL,
        builderName: row.builderName,
        title: row.title,
        city: row.city,
        state: row.state,
        description: row.description,
        bedsMin: row.bedsMin,
        bedsMax: row.bedsMax,
        bathsMin: row.bathsMin,
        bathsMax: row.bathsMax,
        sqftMin: row.sqftMin,
        sqftMax: row.sqftMax,
        priceMin: row.priceMin,
        priceMax: row.priceMax,
        flyerPdfUrl: row.flyerPdfUrl,
        thumbnailUrl: row.thumbnailUrl,
      });
      if (result.created) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push({ title: row.title, error: msg });
      console.error(
        `[scrape-kb-home] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      rawCount,
      normalized: rows.length,
      skipped,
      inserted,
      updated,
      errors,
      elapsedMs,
    },
    errorDetails: errors > 0 ? errorDetails : undefined,
  };
}

export async function GET(req: NextRequest) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason ?? 'Unauthorized' },
      { status: 401 },
    );
  }

  try {
    const result = await runScrape();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scrape-kb-home] fatal error:', msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}

// Some Vercel deployments hit cron endpoints via POST. Accept both.
export async function POST(req: NextRequest) {
  return GET(req);
}
