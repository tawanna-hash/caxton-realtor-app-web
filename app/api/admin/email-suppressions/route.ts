// app/api/admin/email-suppressions/route.ts
//
// GET    — paged list of suppressions (?limit, ?offset, ?q)
// DELETE — body { email } removes a suppression (i.e. allows re-add)

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { listSuppressions, removeSuppression } from '@/lib/server/email-suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireAdmin();
  await ensureSchema();
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') ?? '100')));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));
  const q = (url.searchParams.get('q') ?? '').trim();
  const { rows, total } = await listSuppressions({ limit, offset, search: q });
  return NextResponse.json({ rows, total, limit, offset, q });
});

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  await requireAdmin();
  await ensureSchema();
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'invalid JSON body');
  }
  if (typeof body.email !== 'string' || !body.email.trim()) {
    throw new ApiError(400, 'email_required', 'email is required');
  }
  const ok = await removeSuppression(body.email);
  return NextResponse.json({ ok, removed: ok ? 1 : 0 });
});
