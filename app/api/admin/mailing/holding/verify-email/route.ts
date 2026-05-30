// app/api/admin/mailing/holding/verify-email/route.ts
//
// POST /api/admin/mailing/holding/verify-email
//   Body: { id: string }
//   Runs the row's email through a built-in MX + SMTP RCPT TO probe
//   (see lib/email-verify) and persists the verdict. 'Pending' verdicts
//   (soft failures like greylisting/timeouts) leave the existing status
//   untouched so the user can retry.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  persistEmailVerification,
  type MailingContactRow,
} from '@/lib/mailing';
import { verifyEmail } from '@/lib/email-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be uuid' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM mailing_contacts WHERE id = ${id} AND stage = 'holding'
    `) as unknown as MailingContactRow[];
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (!row.email) {
      const updated = await persistEmailVerification(id, 'Invalid');
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
    let updated = row;
    const persistStatus =
      result.verdict === 'Pending' && row.email_status === 'Valid'
        ? 'Valid'
        : result.verdict;
    updated = (await persistEmailVerification(id, persistStatus, {
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
  } catch (err) {
    console.error('[admin/mailing/holding/verify-email]', errMessage(err));
    return NextResponse.json({ error: 'verify failed', detail: errMessage(err) }, { status: 500 });
  }
}
