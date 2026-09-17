// app/api/admin/getpaid-unlock/route.ts
//
// Verifies the Get Paid development code and, on success, sets the
// per-admin unlock cookie that proxy.ts checks on every Get Paid page and
// mutating API request. See lib/getpaid-gate.ts for the full design.

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { GETPAID_UNLOCK_COOKIE_NAME } from '@/lib/auth/cookie-names';
import { isCorrectGetPaidCode, computeGetPaidUnlockTag } from '@/lib/getpaid-gate';

export const dynamic = 'force-dynamic';

// Light in-memory throttle per server instance — this is a workflow gate,
// not the primary security boundary (admin auth already required below),
// but there's no reason to allow unlimited guesses either.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (isRateLimited(admin.adminId)) {
    return NextResponse.json(
      { error: 'too many attempts — try again later' },
      { status: 429 },
    );
  }

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  if (typeof body.code !== 'string' || !body.code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  if (!isCorrectGetPaidCode(body.code)) {
    return NextResponse.json({ error: 'incorrect code' }, { status: 403 });
  }

  const tag = await computeGetPaidUnlockTag(admin.adminId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GETPAID_UNLOCK_COOKIE_NAME, tag, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Session-scoped on purpose: closing the browser (or 12h passing,
    // whichever first) re-locks the module, so the code has to be
    // re-entered deliberately each working session rather than once ever.
    maxAge: 60 * 60 * 12,
  });
  return res;
}

// Lets the UI re-lock without waiting for the cookie to expire.
export async function DELETE() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GETPAID_UNLOCK_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
