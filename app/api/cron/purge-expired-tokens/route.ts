// app/api/cron/purge-expired-tokens/route.ts
//
// Daily TTL purge for short-lived auth artifacts (F-14 from prod audit).
//
// Auth: Vercel Cron sets `x-vercel-cron: 1`. Manual invocations may also
//       supply `Authorization: Bearer $CRON_SECRET` for one-off runs.
//
// Targets (all with `expires_at` columns):
//   - magic_links                 (15-min realtor magic links)
//   - webauthn_challenges         (5-min WebAuthn challenges)
//   - password_reset_tokens       (1-hr realtor reset tokens)
//   - admin_password_resets       (admin reset tokens)
//   - advertiser_email_grants     (advertiser magic-link grants)
//
// Each row is purged 30 days past expiry to retain a forensic trail for a
// month. After that they're statistically irrelevant and only inflate the
// table.

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETAIN_DAYS_PAST_EXPIRY = 30;

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  // Allow unauthenticated runs in dev so we can hit it manually.
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sql = getSql();
  const cutoffInterval = `${RETAIN_DAYS_PAST_EXPIRY} days`;
  const stats: Record<string, number> = {};

  // Each DELETE runs independently — a missing table or schema drift on one
  // shouldn't abort the rest.
  const targets: Array<{ name: string; run: () => Promise<number> }> = [
    {
      name: 'magic_links',
      run: async () => {
        const r = (await sql`
          DELETE FROM magic_links
          WHERE expires_at < NOW() - INTERVAL '30 days'
          RETURNING token
        `) as unknown as unknown[];
        return r.length;
      },
    },
    {
      name: 'webauthn_challenges',
      run: async () => {
        const r = (await sql`
          DELETE FROM webauthn_challenges
          WHERE expires_at < NOW() - INTERVAL '30 days'
          RETURNING id
        `) as unknown as unknown[];
        return r.length;
      },
    },
    {
      name: 'password_reset_tokens',
      run: async () => {
        const r = (await sql`
          DELETE FROM password_reset_tokens
          WHERE expires_at < NOW() - INTERVAL '30 days'
          RETURNING token
        `) as unknown as unknown[];
        return r.length;
      },
    },
    {
      name: 'admin_password_resets',
      run: async () => {
        const r = (await sql`
          DELETE FROM admin_password_resets
          WHERE expires_at < NOW() - INTERVAL '30 days'
          RETURNING token
        `) as unknown as unknown[];
        return r.length;
      },
    },
    {
      name: 'advertiser_email_grants',
      run: async () => {
        const r = (await sql`
          DELETE FROM advertiser_email_grants
          WHERE expires_at < NOW() - INTERVAL '30 days'
          RETURNING token
        `) as unknown as unknown[];
        return r.length;
      },
    },
    {
      name: 'stripe_webhook_events',
      run: async () => {
        // Stripe retries for up to 3 days. Keep events for 30 days, then drop.
        const r = (await sql`
          DELETE FROM stripe_webhook_events
          WHERE processed_at < NOW() - INTERVAL '30 days'
          RETURNING event_id
        `) as unknown as unknown[];
        return r.length;
      },
    },
  ];

  for (const t of targets) {
    try {
      stats[t.name] = await t.run();
    } catch (err) {
      stats[t.name] = -1;
      console.warn(`[purge-expired-tokens] ${t.name} failed:`,
        err instanceof Error ? err.message : 'unknown');
    }
  }

  const total = Object.values(stats).reduce((acc, n) => acc + (n > 0 ? n : 0), 0);
  console.log('[purge-expired-tokens] purged', total, 'rows', stats);

  return NextResponse.json({
    ok: true,
    retain_days: RETAIN_DAYS_PAST_EXPIRY,
    total_purged: total,
    stats,
    cutoff_interval: cutoffInterval,
  });
}
