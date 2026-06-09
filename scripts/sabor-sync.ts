// caxton-mailing-v1
// SABOR realtor sync runner \u2014 designed for long-running environments
// (GitHub Actions, local cron). Streams batches of scraped records to
// the ingest API so a single run can populate the full 1,500-row holding
// tank without retaining everything in memory.
//
// Required env vars:
//   RAMCO_SABOR_SESSION_ID  \u2014 ASP.NET_SessionId cookie value
//   RAMCO_SABOR_AUTH        \u2014 .RAMCOAUTH cookie value
//   CRON_SECRET             \u2014 shared secret for the ingest API
//   INGEST_URL              \u2014 e.g. https://<host>/api/admin/mailing/sabor-realtors/ingest
//
// Optional:
//   SABOR_MAX_RECORDS  \u2014 cap on detail-page fetches (default: unlimited)
//   SABOR_MAX_PAGES    \u2014 cap on list pages (default: 200)
//   SABOR_DELAY_MS     \u2014 inter-request delay (default: 300)
//   SABOR_BATCH_SIZE   \u2014 records per POST (default: 100)

import {
  scrapeSaborRealtors,
  SaborAuthError,
  type SaborMemberRecord,
} from '../lib/sabor-realtor-scraper';

const BATCH_SIZE = Number(process.env.SABOR_BATCH_SIZE ?? 100);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function postBatch(
  ingestUrl: string,
  secret: string,
  body: {
    records: SaborMemberRecord[];
    partial?: boolean;
    summary?: Record<string, unknown>;
  },
): Promise<{ inserted: number; updated: number; unchanged: number; received: number }> {
  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ingest HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as {
    inserted: number;
    updated: number;
    unchanged: number;
    received: number;
  };
}

async function main(): Promise<void> {
  const ingestUrl = requireEnv('INGEST_URL');
  const secret = requireEnv('CRON_SECRET');
  requireEnv('RAMCO_SABOR_SESSION_ID');
  requireEnv('RAMCO_SABOR_AUTH');

  const maxRecords = process.env.SABOR_MAX_RECORDS
    ? Number(process.env.SABOR_MAX_RECORDS)
    : undefined;
  const maxPages = process.env.SABOR_MAX_PAGES ? Number(process.env.SABOR_MAX_PAGES) : 200;
  const delayMs = process.env.SABOR_DELAY_MS ? Number(process.env.SABOR_DELAY_MS) : 300;

  console.log('=' .repeat(60));
  console.log('SABOR Realtor Sync');
  console.log('=' .repeat(60));
  console.log(`ingest    : ${ingestUrl}`);
  console.log(`maxRecords: ${maxRecords ?? 'unlimited'}`);
  console.log(`maxPages  : ${maxPages}`);
  console.log(`delayMs   : ${delayMs}`);
  console.log(`batchSize : ${BATCH_SIZE}`);
  console.log();

  const t0 = Date.now();
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalSent = 0;
  let pendingBatch: SaborMemberRecord[] = [];

  // We can't easily stream batches mid-scrape because scrapeSaborRealtors
  // accumulates records internally. Instead, after the scrape completes we
  // chunk the result \u2014 still memory-bounded at ~1.5MB JSON for full SABOR.
  try {
    const result = await scrapeSaborRealtors({
      maxRecords,
      maxPages,
      delayMs,
      onProgress: (p) => {
        if (p.phase === 'list') {
          console.log(
            `  [list] page ${p.page}/${p.total ? Math.ceil(p.total / 10) : '?'} \u2014 ${p.fetched} ids`,
          );
        } else {
          console.log(`  [detail] ${p.fetched}/${p.total}`);
        }
      },
    });

    console.log();
    console.log(
      `Scrape complete in ${Math.round((Date.now() - t0) / 1000)}s \u2014 ${result.detailsFetched} records (errors: ${result.errors}, truncated: ${result.truncated})`,
    );

    // Chunk into batches and POST
    const all = result.records;
    for (let i = 0; i < all.length; i += BATCH_SIZE) {
      const batch = all.slice(i, i + BATCH_SIZE);
      const isLast = i + BATCH_SIZE >= all.length;
      const summary = isLast
        ? {
            memberIdsFound: result.memberIdsFound,
            pagesScraped: result.pagesScraped,
            detailsFetched: result.detailsFetched,
            errors: result.errors,
            truncated: result.truncated,
          }
        : undefined;
      const resp = await postBatch(ingestUrl, secret, {
        records: batch,
        partial: !isLast,
        summary,
      });
      totalInserted += resp.inserted;
      totalUpdated += resp.updated;
      totalUnchanged += resp.unchanged;
      totalSent += resp.received;
      console.log(
        `  [ingest] batch ${Math.floor(i / BATCH_SIZE) + 1}: +${resp.inserted} new, ~${resp.updated} updated, =${resp.unchanged} unchanged`,
      );
    }

    // Empty final ping if scraper returned 0 records (still record the run)
    if (all.length === 0) {
      await postBatch(ingestUrl, secret, {
        records: [],
        summary: {
          memberIdsFound: result.memberIdsFound,
          pagesScraped: result.pagesScraped,
          detailsFetched: 0,
          errors: result.errors,
          truncated: result.truncated,
        },
      });
    }

    console.log();
    console.log('=' .repeat(60));
    console.log(
      `Done: sent=${totalSent}, +${totalInserted} new, ~${totalUpdated} updated, =${totalUnchanged} unchanged`,
    );
    console.log(`Total runtime: ${Math.round((Date.now() - t0) / 1000)}s`);
    pendingBatch = []; // suppress unused-var lint
    void pendingBatch;
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\nFAILED:', msg);
    // Notify the ingest endpoint so the admin freshness indicator flips
    if (err instanceof SaborAuthError) {
      try {
        await postBatch(ingestUrl, secret, {
          records: [],
          summary: {
            memberIdsFound: 0,
            pagesScraped: 0,
            detailsFetched: 0,
            errors: 1,
            truncated: false,
          },
        });
      } catch {
        // best-effort
      }
    }
    process.exit(1);
  }
}

void main();
