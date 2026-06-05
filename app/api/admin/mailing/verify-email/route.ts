// app/api/admin/mailing/verify-email/route.ts
//
// POST /api/admin/mailing/verify-email
//   Body: { id: string }
//   Stage-agnostic email verifier for the mailing list. Mirrors
//   app/api/admin/mailing/holding/verify-email/route.ts but fetches the
//   row by id WITHOUT a stage filter and persists via
//   persistEmailVerificationAnyStage, so it works for stage='mailing'
//   segment rows. 'Pending' verdicts (soft failures like
//   greylisting/timeouts) leave the existing status untouched so the
//   user can retry.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  persistEmailVerificationAnyStage,
  type MailingContactRow,
} from '@/lib/mailing';
import { verifyEmail } from '@/lib/email-verify';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { idParamSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  const { id } = await parseJson(req, idParamSchema);

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM mailing_contacts WHERE id = ${id}
  `) as unknown as MailingContactRow[];
  const row = rows[0];
  if (!row) throw new ApiError(404, 'not found');

  if (!row.email) {
    const updated = await persistEmailVerificationAnyStage(id, 'Invalid');
    return NextResponse.json({
      ok: true,
      verdict: 'Invalid',
      detail: 'No email on file.',
      row: updated,
    });
  }

  const result = await verifyEmail(row.email);

  // Persist signals on every probe (even Pending) so the UI shows
  // disposable / role / catch-all / suggestion flags durably. We only
  // overwrite the email_status itself when the verdict is definitive
  // — a soft Pending shouldn't downgrade a previously-Valid mailbox.
  const persistStatus =
    result.verdict === 'Pending' && row.email_status === 'Valid'
      ? 'Valid'
      : result.verdict;
  const updated = (await persistEmailVerificationAnyStage(id, persistStatus, {
    verdict:    result.verdict,
    detail:     result.detail,
    risk:       result.risk,
    signals:    result.signals,
    mx:         result.mx,
    code:       result.code,
    suggestion: result.suggestion,
    normalized: result.normalized,
  })) ?? row;

  return NextResponse.json({
    ok:         true,
    verdict:    result.verdict,
    detail:     result.detail,
    mx:         result.mx ?? null,
    smtpCode:   result.code ?? null,
    risk:       result.risk,
    signals:    result.signals,
    suggestion: result.suggestion ?? null,
    normalized: result.normalized ?? null,
    row:        updated,
  });
});
