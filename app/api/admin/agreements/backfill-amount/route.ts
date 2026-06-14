/**
 * POST /api/admin/agreements/backfill-amount
 *
 * One-shot maintenance endpoint. Fills `agreements.amount_cents` for any
 * row where it's NULL but enough information exists to compute it:
 *
 *   amount_cents = COALESCE(total_monthly_rate_cents, ad_rate_cents)
 *                  × FREQ_MONTHS[frequency]   (1x|3x|6x|12x)
 *
 * If frequency isn't a recognized print cadence (e.g. it's an e-blast
 * agreement), we fall back to the monthly amount as a one-shot so the
 * Agreements list "Amount" column at least reflects something rather
 * than "Not set".
 *
 * Idempotent: rows that already have amount_cents are left alone.
 * Auth: requireAdmin().
 *
 * Body (optional):
 *   { dryRun?: boolean }   // when true, just reports candidates
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';
import { FREQ_MONTHS } from '@/lib/pressbook-constants';

export const runtime = 'nodejs';

interface AgreementRow {
  id: string;
  frequency: string | null;
  ad_rate_cents: number | null;
  total_monthly_rate_cents: number | null;
}

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  let dryRun = false;
  try {
    const body = (await req.json()) as { dryRun?: boolean };
    dryRun = !!body?.dryRun;
  } catch {
    // No body is fine — defaults to a real run.
  }

  const rows = (await sql`
    SELECT id, frequency, ad_rate_cents, total_monthly_rate_cents
      FROM agreements
     WHERE amount_cents IS NULL
       AND (total_monthly_rate_cents IS NOT NULL OR ad_rate_cents IS NOT NULL)
  `) as unknown as AgreementRow[];

  const candidates = rows
    .map((r) => {
      const monthly = r.total_monthly_rate_cents ?? r.ad_rate_cents ?? 0;
      if (monthly <= 0) return null;
      const issues: number = (r.frequency ? FREQ_MONTHS[r.frequency] : undefined) ?? 1;
      return { id: r.id, monthly, issues, amount_cents: monthly * issues };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      total: candidates.length,
      sample: candidates.slice(0, 10),
    });
  }

  let updated = 0;
  for (const c of candidates) {
    await sql`UPDATE agreements SET amount_cents = ${c.amount_cents}, updated_at = NOW() WHERE id = ${c.id} AND amount_cents IS NULL`;
    updated++;
  }

  return NextResponse.json({ updated, total: candidates.length });
});
