// app/api/admin/mailing/sync-realtors/route.ts
//
// POST — admin-session entry point for the UnlockMLS realtor scraper.
// Runs a bounded sync (maxRecords default 2000) and upserts every
// returned agent into the holding-stage mailing table. The same job
// runs unattended via /api/cron/scrape-abor-realtors.
//
//   POST /api/admin/mailing/sync-realtors
//   Optional body: { maxRecords?: number; maxPages?: number; aorFilter?: string; cityFilter?: string }

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { scrapeAborRealtors } from '@/lib/abor-realtor-scraper';
import { upsertHoldingContacts } from '@/lib/mailing';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — scraper can take a while

const syncBodySchema = z
  .object({
    maxRecords: z.coerce.number().int().min(1).max(20000).default(2000),
    maxPages:   z.coerce.number().int().min(1).max(60).optional(),
    aorFilter:  z.string().optional(),
    cityFilter: z.string().optional(),
  })
  .partial()
  .default({});

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const body = await parseJson(req, syncBodySchema);

  const maxRecords = body.maxRecords ?? 2000;
  const maxPages   = body.maxPages;
  const aorFilter  = body.aorFilter;
  const cityFilter = body.cityFilter;

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
      mobile_phone: r.mobile,
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
});
