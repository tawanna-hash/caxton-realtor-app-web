// app/api/cron/verify-pending-batch/route.ts
//
// GET /api/cron/verify-pending-batch
//
// Vercel-cron-friendly (GET) wrapper around the admin-side
// POST /api/admin/mailing/holding/verify-all-pending endpoint.
//
// Vercel Cron jobs only issue GET requests, but the underlying batch
// worker is implemented as a POST so the admin UI can supply a JSON
// body. This wrapper accepts the cron GET, forwards the bearer token,
// and self-fetches the POST endpoint with a default 150-contact batch
// at concurrency 10.
//
// Auth: `Authorization: Bearer $CRON_SECRET` OR `x-vercel-cron: 1`.

import { NextResponse } from 'next/server';

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

function originFromRequest(req: Request): string {
  // Prefer the same origin the cron hit us on so we don't have to
  // configure NEXT_PUBLIC_SITE_URL just for self-calls.
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    const vercel = process.env.VERCEL_URL;
    return vercel ? `https://${vercel}` : 'http://localhost:3000';
  }
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

  const url = new URL(req.url);
  const batchSize   = Math.max(1, Math.min(500, Number(url.searchParams.get('batch'))       || 150));
  const concurrency = Math.max(1, Math.min(25,  Number(url.searchParams.get('concurrency')) || 10));

  const origin = originFromRequest(req);
  const target = `${origin}/api/admin/mailing/holding/verify-all-pending`;
  const started = Date.now();

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${process.env.CRON_SECRET}`,
        'content-type':  'application/json',
      },
      body: JSON.stringify({ batchSize, concurrency }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        ok: res.ok,
        durationMs: Date.now() - started,
        status: res.status,
        ...json,
      },
      { status: res.ok ? 200 : 502 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron verify-pending-batch] failed:', msg);
    return NextResponse.json(
      { ok: false, durationMs: Date.now() - started, message: msg },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
