// app/api/cron/mailchimp-utm/route.ts
//
// Daily at 10:00 UTC (5 AM CDT / 4 AM CST): turn on Mailchimp Google Analytics link tracking (UTM tags)
// for any draft, paused, or scheduled campaign that doesn't have it yet.
// See ensureUtmTracking() in lib/server/mailchimp.ts.
//
// Auth: `Authorization: Bearer $CRON_SECRET` (sent by Vercel Cron).

import { NextResponse } from 'next/server';
import { ensureUtmTracking, isMailchimpConfigured } from '@/lib/server/mailchimp';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isMailchimpConfigured()) return NextResponse.json({ ok: true, skipped: 'MAILCHIMP_API_KEY not set' });

  const results = await ensureUtmTracking();
  const errors = results.filter((r) => r.action === 'error');
  if (results.length) logger.info({ results }, '[mailchimp-utm] run');
  if (errors.length) logger.warn({ errors }, '[mailchimp-utm] some campaigns failed');
  return NextResponse.json({ ok: errors.length === 0, results });
}
