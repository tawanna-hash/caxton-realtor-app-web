// app/api/admin/scrapers/run/route.ts
//
// POST /api/admin/scrapers/run
//   Body: { path: string }  // e.g. "scrape-kb-home"
//
// Admin-only proxy for manually running a scheduled scraper. Reads
// CRON_SECRET from process.env server-side and forwards to the target
// /api/cron/<path> route with a Bearer header. The browser never sees
// the secret.
//
// Auth: requires an admin session cookie. No bearer/cron auth path —
// this endpoint exists specifically to hide the bearer from clients.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Only routes matching /^scrape-[a-z0-9-]+$/ or /^sync-[a-z0-9-]+$/ are
// allowed. Prevents open-redirect / SSRF into arbitrary /api/cron/* by
// a compromised admin session. Every entry corresponds to an existing
// app/api/cron/<path>/route.ts.
const PATH_SCHEMA = z
  .string()
  .regex(/^(scrape|sync)-[a-z0-9-]+$/, 'Invalid scraper path');

const BODY_SCHEMA = z.object({ path: PATH_SCHEMA });

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new ApiError(500, 'Server misconfigured: CRON_SECRET env var not set.');
  }

  const raw = await req.json().catch(() => null);
  const parsed = BODY_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid body');
  }
  const { path } = parsed.data;

  const origin = new URL(req.url).origin;
  const target = `${origin}/api/cron/${path}`;

  const res = await fetch(target, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const text = await res.text();
  // Try to parse as JSON so we can forward status + shape verbatim.
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { payload = { ok: res.ok, raw: text.slice(0, 500) }; }

  return NextResponse.json(payload, { status: res.status });
});
