// app/api/admin/email-verify/route.ts
//
// POST /api/admin/email-verify
//   Body: { email: string }
//   Ad-hoc single-address verifier for the /admin/email-verify tool.
//
//   Unlike /api/admin/mailing/verify-email (which fetches a mailing_contacts
//   row by id and persists the result), this endpoint runs the verifier
//   against any free-form address and returns the result without writing
//   to the database. It's the lightweight backing API for the standalone
//   admin verification page.
//
//   The actual verification logic is shared with the mailing-list flows via
//   lib/email-verify.ts — same syntax / disposable / role / MX / SMTP probe
//   pipeline, same managed-mail short-circuit, same typo suggestions.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { verifyEmail } from '@/lib/email-verify';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseJson } from '@/lib/server/schemas/_common';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// SMTP probes can take a few seconds per MX, especially with multiple
// retries. 30s matches the mailing-list verifier ceiling.
export const maxDuration = 30;

const singleSchema = z.object({
  email: z.string().trim().min(3).max(320),
});

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const { email } = await parseJson(req, singleSchema);

  const result = await verifyEmail(email);

  if (result.verdict !== 'Valid') {
    captureServerEvent('verify_failed', email || 'server', {
      surface: 'admin_email_verify',
      verdict: result.verdict,
      email,
    });
    await flushServerEvents();
  }

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
  });
});
