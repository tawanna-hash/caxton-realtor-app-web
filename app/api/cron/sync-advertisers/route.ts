// app/api/cron/sync-advertisers/route.ts
//
// Cron-secret-gated endpoint that walks every active advertiser and
// inserts any missing Advertisers-segment mailing rows. Designed to be
// hit on a schedule (Vercel Cron or any external scheduler).
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sync-advertisers
//
// Vercel Cron sends the `x-vercel-cron` header on scheduled invocations,
// which we accept in lieu of the bearer for convenience.

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { syncAdvertisersFromAdvertisers } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  // Vercel adds this header on scheduled invocations.
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
    const result = await syncAdvertisersFromAdvertisers();
    return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron sync-advertisers] failed:', msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
