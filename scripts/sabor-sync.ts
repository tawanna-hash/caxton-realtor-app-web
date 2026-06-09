// caxton-mailing-v1
// SABOR (San Antonio Board of REALTORS) realtor sync runner.
//
// Data source: https://www.realtytexas.com/real-search
//   Public statewide Texas realtor directory aggregating TREC + every
//   Texas MLS (incl. SABOR) into a single index. Records include emails
//   for ~94% of active licensees. No auth, no cookies, no postbacks.
//
// Filter: keeps records where Source = 'MLS: SABOR' OR PostalCode starts
// with '78' (SABOR territory: Bexar + surrounding counties).
//
// Required env vars:
//   CRON_SECRET  — shared secret for the ingest API
//   INGEST_URL   — e.g. https://<host>/api/admin/mailing/sabor-realtors/ingest
//
// Optional:
//   SABOR_MAX_RECORDS         — cap on records (default: unlimited)
//   SABOR_MAX_PAGES_PER_LETTER — cap per letter a-z (default: 30)
//   SABOR_MAX_LETTERS         — number of letters to walk (default: 26)
//   SABOR_DELAY_MS            — inter-request delay (default: 300)
//   SABOR_BATCH_SIZE          — records per POST (default: 100)
//   SABOR_FILTER              — 'sabor' | 'sabor-or-78xxx' | 'all'
//                               (default: 'sabor-or-78xxx')

import {
  scrapeRealtyTexas,
  type SaborMemberRecord,
} from '../lib/realty-texas-scraper';

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

  const maxRecords = process.env.SABOR_MAX_RECORDS
    ? Number(process.env.SABOR_MAX_RECORDS)
    : undefined;
  const maxPagesPerLetter = process.env.SABOR_MAX_PAGES_PER_LETTER
    ? Number(process.env.SABOR_MAX_PAGES_PER_LETTER)
    : 30;
  const maxLetters = process.env.SABOR_MAX_LETTERS
    ? Number(process.env.SABOR_MAX_LETTERS)
    : 26;
  const delayMs = process.env.SABOR_DELAY_MS ? Number(process.env.SABOR_DELAY_MS) : 300;
  const filterEnv = (process.env.SABOR_FILTER ?? 'sabor-or-78xxx') as
    | 'sabor'
    | 'sabor-or-78xxx'
    | 'all';

  console.log('='.repeat(60));
  console.log('SABOR Realtor Sync (RealtyTexas source)');
  console.log('='.repeat(60));
  console.log(`ingest         : ${ingestUrl}`);
  console.log(`maxRecords     : ${maxRecords ?? 'unlimited'}`);
  console.log(`maxPagesPerLet : ${maxPagesPerLetter}`);
  console.log(`maxLetters     : ${maxLetters}`);
  console.log(`delayMs        : ${delayMs}`);
  console.log(`batchSize      : ${BATCH_SIZE}`);
  console.log(`filter         : ${filterEnv}`);
  console.log();

  const t0 = Date.now();
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalSent = 0;

  try {
    const result = await scrapeRealtyTexas({
      maxRecords,
      maxPagesPerLetter,
      maxLetters,
      delayMs,
      filter: filterEnv,
      statusFilter: 'Active',
      requireEmail: true,
      onProgress: (p) => {
        if (p.kept > 0) {
          console.log(
            `  [list] letter=${p.letter} page=${p.page} +${p.kept} kept (running total: ${p.fetched})`,
          );
        }
      },
    });

    console.log();
    console.log(
      `Scrape complete in ${Math.round((Date.now() - t0) / 1000)}s — ` +
        `${result.records.length} records (scanned ${result.recordsScanned}, ` +
        `pages ${result.pagesScraped}, errors ${result.errors}, ` +
        `truncated ${result.truncated})`,
    );

    const all = result.records;
    for (let i = 0; i < all.length; i += BATCH_SIZE) {
      const batch = all.slice(i, i + BATCH_SIZE);
      const isLast = i + BATCH_SIZE >= all.length;
      const summary = isLast
        ? {
            memberIdsFound: all.length,
            pagesScraped: result.pagesScraped,
            detailsFetched: all.length,
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
        `  [ingest] batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
          `+${resp.inserted} new, ~${resp.updated} updated, =${resp.unchanged} unchanged`,
      );
    }

    if (all.length === 0) {
      await postBatch(ingestUrl, secret, {
        records: [],
        summary: {
          memberIdsFound: 0,
          pagesScraped: result.pagesScraped,
          detailsFetched: 0,
          errors: result.errors,
          truncated: result.truncated,
        },
      });
    }

    console.log();
    console.log('='.repeat(60));
    console.log(
      `Done: sent=${totalSent}, +${totalInserted} new, ` +
        `~${totalUpdated} updated, =${totalUnchanged} unchanged`,
    );
    console.log(`Total runtime: ${Math.round((Date.now() - t0) / 1000)}s`);
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\nFAILED:', msg);
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
    process.exit(1);
  }
}

void main();
