// app/api/cron/prune-expired-promotions/route.ts
//
// Monthly purge of expired promotions. On the 1st of each month at ~12:01am
// Central, hard-delete every promotion the system has already marked
// status='expired' — i.e. promotions whose expires_at passed and were
// auto-hidden from the public feed by the every-3-hours
// /api/cron/expire-promotions job (which also sends a daily 8am digest email
// to tawanna@myrealtyline.com when rows flip).
//
// Vercel cron schedule: 1 6 1 * *  (06:01 UTC on day 1)
//   - CST (winter, UTC-6): 12:01am on the 1st
//   - CDT (summer, UTC-5):  1:01am on the 1st
//   A single fixed-UTC cron can't follow the DST shift; 06:01 UTC keeps the
//   run on the 1st year-round (05:01 UTC would fire on the last day of the
//   previous month during winter). Cron startup adds ~minutes of latency, so
//   the exact minute is best-effort.
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production, or the
// x-vercel-cron header Vercel sends on real cron invocations. Open in
// dev/preview so we can test locally without the secret.

import { NextResponse } from 'next/server';
import { deleteExpiredPromotions } from '../../../../lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === 'production' && !authorized(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const started = Date.now();
  try {
    const { deleted, sample } = await deleteExpiredPromotions();
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      deleted,
      sample: sample.slice(0, 50),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}
