// app/api/admin/advertisers/backfill-from-agreements/route.ts
//
// One-shot backfill: re-sync every linked agreement into its advertiser
// using lib/server/billing-crm-sync.ts. Run once after deploying the
// Billing<->CRM sync wiring so existing rows pick up the mirrored
// billing/payment/deal columns.
//
// POST /api/admin/advertisers/backfill-from-agreements
//
// Idempotent: safe to call repeatedly. Picks the most-recent active-ish
// agreement per advertiser (matching the source-of-truth rule in
// syncAgreementToAdvertiser via pickCurrentAgreementId).

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const sql = getSql();

    // One agreement per advertiser — the most recent active-ish one.
    // Mirrors the priority used by pickCurrentAgreementId.
    const rows = (await sql`
      SELECT DISTINCT ON (advertiser_id) *
        FROM agreements
       WHERE advertiser_id IS NOT NULL
       ORDER BY
         advertiser_id,
         CASE status
           WHEN 'signed'    THEN 0
           WHEN 'active'    THEN 1
           WHEN 'sent'      THEN 2
           WHEN 'draft'     THEN 3
           WHEN 'expired'   THEN 4
           WHEN 'cancelled' THEN 5
           ELSE 6
         END,
         COALESCE(signed_at, created_at) DESC
    `) as unknown as Agreement[];

    let synced = 0;
    let skipped = 0;
    const errors: Array<{ agreement_id: string; advertiser_id: number | null; error: string }> = [];

    for (const ag of rows) {
      try {
        const updated = await syncAgreementToAdvertiser(ag);
        if (updated.length > 0) synced += 1;
        else skipped += 1;
      } catch (e) {
        errors.push({
          agreement_id: ag.id,
          advertiser_id: ag.advertiser_id,
          error: errMessage(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      examined: rows.length,
      synced,
      skipped,
      errors,
    });
  } catch (err) {
    console.error('[advertisers/backfill-from-agreements]', errMessage(err));
    return NextResponse.json({ error: 'backfill failed', detail: errMessage(err) }, { status: 500 });
  }
}
