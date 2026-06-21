// app/api/admin/mailing/holding/reject/route.ts
//
// POST /api/admin/mailing/holding/reject
//   Body: { ids: string[] }
//   Hard-deletes holding rows. Will not touch rows already promoted to
//   stage='mailing' (the helper scopes the delete by stage).

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { rejectHoldingContactsWithSnapshot } from '@/lib/mailing';
import { withErrorHandling } from '@/lib/server/error';
import { bulkIdsSchema, parseJson } from '@/lib/server/schemas/_common';
import { suppressEmailsBatch } from '@/lib/server/email-suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await requireAdmin();
  await ensureSchema();

  const { ids } = await parseJson(req, bulkIdsSchema);
  const { removed, rows } = await rejectHoldingContactsWithSnapshot(ids);
  const suppressed = await suppressEmailsBatch(
    rows.map((r) => ({
      email: r.email,
      source_id: r.id,
      snapshot: {
        first_name: r.first_name,
        last_name: r.last_name,
        segment: r.segment,
        stage: 'holding',
        external_id: r.external_id,
        external_source: r.external_source,
      },
    })),
    {
      reason: 'holding_reject',
      source_table: 'mailing_contacts',
      suppressed_by: admin.email,
    },
  );
  return NextResponse.json({ ok: true, removed, suppressed });
});
