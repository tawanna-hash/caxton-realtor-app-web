/**
 * POST /api/admin/agreements/backfill-channel
 *
 * One-shot maintenance endpoint. Re-derives `agreements.channel` from
 * each agreement's `type`, so /admin/ads/orders routes the row into
 * the correct Print / Digital / Email tab:
 *
 *   type = 'print_ad'  → channel = 'print'
 *   type = 'eblast'    → channel = 'email'
 *   anything else      → channel = 'digital'
 *
 * Idempotent: only writes rows where channel differs from the derived
 * value. Auth: requireAdmin().
 *
 * Body (optional):
 *   { dryRun?: boolean }   // when true, just reports candidates
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';
import { deriveChannelFromAgreementType } from '@/lib/ad-channels';

export const runtime = 'nodejs';

interface AgreementRow {
  id: string;
  type: string | null;
  channel: string | null;
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
    SELECT id, type, channel FROM agreements
  `) as unknown as AgreementRow[];

  const candidates = rows
    .map((r) => {
      const derived = deriveChannelFromAgreementType(r.type);
      if (r.channel === derived) return null;
      return { id: r.id, from: r.channel, to: derived };
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
    await sql`UPDATE agreements SET channel = ${c.to}, updated_at = NOW() WHERE id = ${c.id}`;
    updated++;
  }

  return NextResponse.json({ updated, total: candidates.length });
});
