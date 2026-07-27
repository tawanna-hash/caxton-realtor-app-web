// app/api/admin/mailing/holding/promote/route.ts
//
// POST /api/admin/mailing/holding/promote
//   Body: { ids: string[] }
//   Promotes verified holding contacts to stage='mailing'. Rows that
//   are not verified (neither addr_status='Valid' nor email_status='Valid')
//   are skipped, as are rows whose email already exists in the active
//   mailing list.

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { promoteHoldingContacts } from '@/lib/mailing';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { bulkIdsSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const { ids } = await parseJson(req, bulkIdsSchema);
  const result = await promoteHoldingContacts(ids);
  return NextResponse.json({ ok: true, ...result });
});
