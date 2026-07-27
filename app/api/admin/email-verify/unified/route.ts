// app/api/admin/email-verify/unified/route.ts
//
// POST { email: string, force?: boolean }
//   → { ok, row }
//
// Verifies a single address against the in-house SMTP probe and
// upserts the result into the unified email_verifications table.
// Used by row-level "verify now" buttons on Subscribers, Newsletter,
// and the publication CSV export pre-flight.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureSchema } from '@/lib/db';
import { verifyAndStore, getStatus } from '@/lib/server/email-verifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  let body: { email?: unknown; force?: unknown } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !email.includes('@')) {
    throw new ApiError(400, 'invalid_email', 'A valid email is required.');
  }
  const force = body.force === true;

  const row = await verifyAndStore(email, { force });
  if (!row) throw new ApiError(500, 'verify_failed', 'Verification produced no row.');

  return NextResponse.json({ ok: true, row });
});

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  const url = new URL(req.url);
  const email = url.searchParams.get('email') ?? '';
  if (!email.includes('@')) {
    throw new ApiError(400, 'invalid_email', 'Pass ?email=user@host');
  }
  const row = await getStatus(email);
  return NextResponse.json({ ok: true, row });
});
