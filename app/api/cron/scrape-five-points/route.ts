// app/api/cron/scrape-five-points/route.ts
//
// Bearer-gated (CRON_SECRET) endpoint that collects the Five Points Board of
// REALTORS member directory and upserts every member into the holding-stage
// mailing table (external_source = 'five-points-board').
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/scrape-five-points

import { NextResponse } from 'next/server';
import { scrapeFivePointsMembers, FIVE_POINTS_SOURCE, FIVE_POINTS_LABEL } from '@/lib/five-points-scraper';
import { upsertHoldingContacts } from '@/lib/mailing';
import { withScraperRun } from '@/lib/with-scraper-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

async function _GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: 'CRON_SECRET env var is not set.' }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  }
  const started = Date.now();
  try {
    const { records, discovered, failed } = await scrapeFivePointsMembers();
    const upsert = await upsertHoldingContacts(
      records.map((r) => ({
        external_id: r.external_id,
        external_source: FIVE_POINTS_SOURCE,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        company: r.company,
        title: r.title,
        address: r.address,
        state: r.state,
        zip: r.zip,
        segment: 'realtor' as const,
        source: FIVE_POINTS_LABEL,
      })),
    );
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      scraped: records.length,
      rawCount: discovered,
      failed,
      ...upsert,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron scrape-five-points] failed:', msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}

export const GET = withScraperRun('scrape-five-points', _GET);

export const POST = GET;
