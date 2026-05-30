// app/api/cron/scrape-abor-realtors/route.ts
//
// Bearer-gated (CRON_SECRET) endpoint that runs the UnlockMLS realtor
// scraper and upserts every returned agent into the holding-stage
// mailing table.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/scrape-abor-realtors
//
// Vercel Cron sends the `x-vercel-cron` header on scheduled invocations,
// which we accept in lieu of the bearer for convenience.

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { scrapeAborRealtors } from '@/lib/abor-realtor-scraper';
import { upsertHoldingContacts } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, message: 'CRON_SECRET env var is not set.' },
      { status: 500 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  }

  const started = Date.now();
  try {
    await ensureSchema();
    const { records, pagesScraped, totalReportedByServer, truncated } = await scrapeAborRealtors({
      maxRecords: 2000,
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron scrape-abor-realtors] failed:', msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
