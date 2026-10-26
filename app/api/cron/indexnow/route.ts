// app/api/cron/indexnow/route.ts
//
// Hourly Vercel Cron. Pings IndexNow for public event and magazine-issue URLs
// that have not been submitted before.
//
// State lives in `indexnow_submitted` (one row per URL). The first run on an
// empty table only records the current URLs without submitting (they were
// already submitted manually), so it never floods the endpoint. After that,
// only genuinely new URLs are sent. A URL is recorded only after IndexNow
// accepts the batch, so failures retry on the next run.

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { cronAuthEnforced, hasValidCronSecret } from '@/lib/server/cron-auth';
import { eventEntries, magazineEntries } from '@/lib/sitemap-entries';
import { submitToIndexNow } from '@/lib/indexnow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (cronAuthEnforced() && !hasValidCronSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS indexnow_submitted (
      url TEXT PRIMARY KEY,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pinged BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;

  const [events, mags] = await Promise.all([eventEntries(), magazineEntries()]);
  const current = [...new Set([...events, ...mags].map((e) => e.url))];
  if (current.length === 0) return NextResponse.json({ ok: true, current: 0, new: 0 });

  const known = (await sql`SELECT url FROM indexnow_submitted`) as Array<{ url: string }>;
  const bootstrap = known.length === 0;
  const seen = new Set(known.map((r) => r.url));
  const fresh = current.filter((u) => !seen.has(u));
  if (fresh.length === 0) return NextResponse.json({ ok: true, current: current.length, new: 0 });

  let status = 0;
  if (!bootstrap) {
    const res = await submitToIndexNow(fresh);
    status = res.status;
    if (!res.ok) {
      console.error('[indexnow] submit failed', res.status);
      return NextResponse.json({ ok: false, status: res.status, new: fresh.length }, { status: 502 });
    }
  }
  await sql`
    INSERT INTO indexnow_submitted (url, pinged)
    SELECT u, ${!bootstrap} FROM unnest(${fresh}::text[]) AS u
    ON CONFLICT (url) DO NOTHING
  `;
  return NextResponse.json({ ok: true, bootstrap, current: current.length, new: fresh.length, status });
}
