// app/api/cron/scrape-mi-homes/route.ts
//
// Vercel Cron endpoint. Runs daily, fetches M/I Homes Austin communities
// from their Sitecore API (no HTML scraping), and upserts each into
// builder_inventory keyed on (builder_name, external_id).
//
// Auth: in production we require `Authorization: Bearer ${CRON_SECRET}`,
// which Vercel automatically attaches to scheduled invocations when the
// CRON_SECRET env var is set. In dev/preview we allow unauthenticated
// access for testing — set CRON_SECRET in Vercel before enabling the
// cron in vercel.json to harden production.
//
// Behavior on upsert:
//   - NEW community (no row with matching external_id): INSERT as
//     status='pending' so it lands in the admin queue for review.
//   - EXISTING community: UPDATE only data-driven fields (title, city,
//     description, beds/baths/sqft/price). Does NOT touch status,
//     featured, reviewedBy, or reviewedAt — those are admin decisions
//     and the scraper has no business overwriting them.
//
// Errors:
//   - Whole-scraper failure (M/I down, malformed response): returns 500.
//   - Per-row failure (one community errors during upsert): logs and
//     continues with the rest. Vercel logs surface the bad rows.

import { NextRequest, NextResponse } from 'next/server';
import { fetchMIHomesAustin } from '@/lib/scrapers/mi-homes';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Allow up to 60s — single fetch + ~8 upserts should be well under this,
// but Vercel's default is 10s and we want headroom for Neon cold starts.
export const maxDuration = 60;

// Sentinel identity for scraper-submitted rows. Admin queue shows these
// alongside human submissions; the email pattern makes them easy to filter.
const SCRAPER_SUBMITTER_NAME = 'M/I Homes Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-mi-homes@harmonyone.system';

function verifyCronAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');

  if (!isProduction) {
    // Dev/preview: allow without auth so curl + browser testing works.
    return { ok: true };
  }

  // Production: require CRON_SECRET to be set AND match the bearer.
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
  const { rows, rawCount, skipped } = await fetchMIHomesAustin();

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
        `[scrape-mi-homes] upsert failed for "${row.title}" (${row.externalId}):`,
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
    console.error('[scrape-mi-homes] fatal error:', msg);
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
