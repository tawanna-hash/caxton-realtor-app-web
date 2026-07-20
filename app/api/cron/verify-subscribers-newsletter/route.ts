// app/api/cron/verify-subscribers-newsletter/route.ts
//
// Daily drip verifier for the realtors (app subscribers) and
// newsletter_subscribers tables. These are the two audiences that
// don't yet have an `email_status` column — they live in the unified
// email_verifications lookup. The existing /api/cron/verify-pending-batch
// already drains mailing_contacts + ABOR/SABOR holding, so this
// endpoint stays focused.
//
// Auth: `Authorization: Bearer $CRON_SECRET` OR `x-vercel-cron: 1`.

import { NextResponse } from 'next/server';
// removed: ensureSchema import
import { pickPendingEmails, verifyBatch } from '@/lib/server/email-verifications';

export const runtime     = 'nodejs';
export const dynamic     = 'force-dynamic';
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

  // removed: ensureSchema() — crons should not run DDL

  const url = new URL(req.url);
  const batchSize   = Math.max(1, Math.min(500, Number(url.searchParams.get('batch'))       || 200));
  const concurrency = Math.max(1, Math.min(25,  Number(url.searchParams.get('concurrency')) || 8));
  const started = Date.now();

  try {
    const emails = await pickPendingEmails(batchSize);
    if (emails.length === 0) {
      return NextResponse.json({
        ok: true,
        durationMs: Date.now() - started,
        picked: 0,
        verified: 0,
        skipped: 0,
        message: 'No pending emails.',
      });
    }

    const { verified, skipped } = await verifyBatch(emails, concurrency);

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      picked: emails.length,
      verified,
      skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron verify-subscribers-newsletter] failed:', msg);
    return NextResponse.json(
      { ok: false, durationMs: Date.now() - started, message: msg },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
