// app/api/cron/keep-warm/route.ts
//
// Every 5 minutes: keeps the admin Agreements page and the billing pay
// pages from paying a cold-start penalty (observed ~2.4-2.9s on the first
// Agreements request after idle vs ~200ms warm). Runs ensureSchema() and a
// trivial query so the database connection and schema check are warm, and
// requests the admin Agreements and portal pages so their server bundles
// are loaded. The page requests are unauthenticated and only warm the
// function; they return a redirect or login page and expose no data.
//
// Auth: CRON_SECRET bearer token only.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PATHS = ['/admin/agreements', '/admin/billing-hub/invoices', '/portal/login'];

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || (req.headers.get('authorization') ?? '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  await ensureSchema();
  await getSql()`SELECT 1`;
  const dbMs = Date.now() - t0;

  const base = (process.env.APP_BASE_URL || new URL(req.url).origin).replace(/\/$/, '');
  const pages = await Promise.all(
    PATHS.map(async (p) => {
      const s = Date.now();
      try {
        const r = await fetch(base + p, { redirect: 'manual', cache: 'no-store' });
        return { path: p, status: r.status, ms: Date.now() - s };
      } catch {
        return { path: p, status: 0, ms: Date.now() - s };
      }
    })
  );
  return NextResponse.json({ ok: true, dbMs, pages });
}
