// app/api/admin/mailing/holding/reject/route.ts
//
// POST /api/admin/mailing/holding/reject
//   Body: { ids: string[] }
//   Hard-deletes holding rows. Will not touch rows already promoted to
//   stage='mailing' (the helper scopes the delete by stage).

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { rejectHoldingContacts } from '@/lib/mailing';
import { withErrorHandling } from '@/lib/server/error';
import { bulkIdsSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const { ids } = await parseJson(req, bulkIdsSchema);
  const removed = await rejectHoldingContacts(ids);
  return NextResponse.json({ ok: true, removed });
});
