// app/api/cron/indexnow/route.ts
//
// Hourly Vercel Cron. Pings IndexNow (Bing, Yandex, etc.) for public URLs
// that are new or whose content changed: events, magazine issues, builder
// pages and partner pages.
//
// State lives in `indexnow_submitted` (url, content fingerprint). Per run:
//   - URL never seen        -> submit (new)
//   - fingerprint changed   -> submit (edited / updated)
//   - otherwise             -> nothing
// Baselining: the first time a URL group (events, magazine, builders,
// partners) is seen, or a row has no fingerprint yet, the current state is
// recorded silently, because those URLs were already submitted through the
// sitemap / manual IndexNow push. Rows are only written after IndexNow
// accepts the batch, so failures retry on the next run.

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { cronAuthEnforced, hasValidCronSecret } from '@/lib/server/cron-auth';
import {
  builderEntries,
  eventEntries,
  magazineEntries,
  partnerEntries,
} from '@/lib/sitemap-entries';
import { submitToIndexNow } from '@/lib/indexnow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function groupOf(url: string): string {
  return new URL(url).pathname.split('/')[1] || '';
}

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
  await sql`ALTER TABLE indexnow_submitted ADD COLUMN IF NOT EXISTS fingerprint TEXT`;

  const lists = await Promise.all([
    eventEntries(),
    magazineEntries(),
    builderEntries(),
    partnerEntries(),
  ]);
  // A group that returned nothing may have failed its query; skip it rather
  // than treat it as "all removed" (we never delete state anyway).
  const current = new Map<string, string>();
  for (const e of lists.flat()) current.set(e.url, e.fingerprint);
  if (current.size === 0) return NextResponse.json({ ok: true, current: 0, pinged: 0 });

  const known = (await sql`SELECT url, fingerprint FROM indexnow_submitted`) as Array<{
    url: string;
    fingerprint: string | null;
  }>;
  const knownFp = new Map(known.map((r) => [r.url, r.fingerprint]));
  const knownGroups = new Set(known.map((r) => groupOf(r.url)));

  const toPing: string[] = [];
  const baseline: Array<[string, string]> = [];
  const added: string[] = [];
  const changed: string[] = [];
  for (const [url, fp] of current) {
    const had = knownFp.has(url);
    const prev = knownFp.get(url);
    if (!had) {
      if (!knownGroups.has(groupOf(url))) baseline.push([url, fp]);
      else {
        toPing.push(url);
        added.push(url);
      }
    } else if (prev == null) {
      baseline.push([url, fp]);
    } else if (prev !== fp) {
      toPing.push(url);
      changed.push(url);
    }
  }

  let status = 0;
  if (toPing.length > 0) {
    const res = await submitToIndexNow(toPing);
    status = res.status;
    if (!res.ok) {
      console.error('[indexnow] submit failed', res.status);
      return NextResponse.json(
        { ok: false, status: res.status, pending: toPing.length },
        { status: 502 },
      );
    }
  }

  const writes: Array<[string, string, boolean]> = [
    ...baseline.map(([u, f]) => [u, f, false] as [string, string, boolean]),
    ...toPing.map((u) => [u, current.get(u)!, true] as [string, string, boolean]),
  ];
  if (writes.length > 0) {
    await sql`
      INSERT INTO indexnow_submitted (url, fingerprint, pinged, submitted_at)
      SELECT u, f, p, NOW()
      FROM unnest(${writes.map((w) => w[0])}::text[], ${writes.map((w) => w[1])}::text[], ${writes.map((w) => w[2])}::boolean[]) AS t(u, f, p)
      ON CONFLICT (url) DO UPDATE
        SET fingerprint = EXCLUDED.fingerprint,
            pinged = EXCLUDED.pinged OR indexnow_submitted.pinged,
            submitted_at = CASE WHEN EXCLUDED.pinged THEN NOW() ELSE indexnow_submitted.submitted_at END
    `;
  }
  return NextResponse.json({
    ok: true,
    current: current.size,
    baselined: baseline.length,
    new: added.length,
    changed: changed.length,
    status,
  });
}
