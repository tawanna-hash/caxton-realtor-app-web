// app/api/admin/advertisers/backfill-from-agreements/route.ts
//
// One-shot backfill: re-runs syncAgreementToAdvertiser for every advertiser
// that has at least one linked agreement, so the new mirror columns
// (billing_contact_*, payment_mode, stripe_customer_id, card_last4,
// current_agreement_id, current_*) are populated for advertisers whose
// agreements existed before the sync helpers shipped (PR #87).
//
// Idempotent: safe to run multiple times. Returns a summary
// { processed, updated, errors }.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';
import type { Agreement } from '@/lib/agreements';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export const POST = withAdminTracking(async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const sql = getSql();

    // Pull all agreements that already have a linked advertiser. The helper
    // itself decides whether each agreement is the advertiser's "current"
    // one and only mirrors the deal/billing facts if so — so we can safely
    // iterate every linked agreement and let the helper sort it out.
    const ags = (await sql`
      SELECT *
        FROM agreements
       WHERE advertiser_id IS NOT NULL
       ORDER BY advertiser_id, COALESCE(signed_at, created_at) DESC
    `) as unknown as Agreement[];

    let processed = 0;
    let updated = 0;
    const errors: Array<{ agreement_id: string; error: string }> = [];

    for (const ag of ags) {
      processed += 1;
      try {
        const cols = await syncAgreementToAdvertiser(ag);
        if (cols.length > 0) updated += 1;
      } catch (e) {
        errors.push({ agreement_id: ag.id, error: errMessage(e) });
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      updated,
      errors,
    });
  } catch (err) {
    console.error('[admin/advertisers/backfill-from-agreements POST]', errMessage(err));
    return NextResponse.json(
      { error: 'backfill failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
