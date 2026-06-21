// app/api/admin/email-verify/bulk/route.ts
//
// POST /api/admin/email-verify/bulk
//   Body: { emails: string[] }   (max 100)
//   Ad-hoc bulk verifier for the /admin/email-verify tool.
//
//   Runs verifyEmail() across a list with limited concurrency so we don't
//   blow past the serverless function's connection budget or the SMTP
//   probe's per-MX rate-limit budget. Returns one result per input row in
//   the same order — invalid syntax inputs short-circuit cheaply.
//
//   Like the single-address route, results are NOT persisted. This is an
//   ad-hoc tool; persistent verification lives under the mailing-list
//   routes which write to mailing_contacts.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { verifyEmail, type EmailVerifyResult } from '@/lib/email-verify';
import { withErrorHandling } from '@/lib/server/error';
import { parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Each address can take a few seconds when SMTP probes run; we cap input
// at 100 and run with concurrency=8, so worst-case ~13 sequential batches.
// 60s gives comfortable headroom on Vercel's hobby/pro plans.
export const maxDuration = 60;

const MAX_BATCH = 100;
const CONCURRENCY = 8;

const bulkSchema = z.object({
  emails: z
    .array(z.string().trim().min(3).max(320))
    .min(1)
    .max(MAX_BATCH),
});

type BulkRow = {
  input:      string;
  verdict:    EmailVerifyResult['verdict'];
  detail:     string;
  mx:         string | null;
  smtpCode:   number | null;
  risk:       number;
  signals:    EmailVerifyResult['signals'];
  suggestion: string | null;
  normalized: string | null;
};

/**
 * Run verifyEmail() across the inputs with bounded concurrency. We preserve
 * input order — callers display results as a table aligned with the input
 * list, so order matters.
 */
async function verifyAll(emails: string[]): Promise<BulkRow[]> {
  const results: BulkRow[] = new Array(emails.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= emails.length) return;
      const input = emails[i];
      try {
        const r = await verifyEmail(input);
        results[i] = {
          input,
          verdict:    r.verdict,
          detail:     r.detail,
          mx:         r.mx ?? null,
          smtpCode:   r.code ?? null,
          risk:       r.risk,
          signals:    r.signals,
          suggestion: r.suggestion ?? null,
          normalized: r.normalized ?? null,
        };
      } catch (err) {
        // verifyEmail() is documented as never throwing, but we belt-and-
        // brace it so a single bad row can't kill the whole batch.
        results[i] = {
          input,
          verdict:    'Invalid',
          detail:     err instanceof Error ? err.message : 'Verification error',
          mx:         null,
          smtpCode:   null,
          risk:       100,
          signals: {
            syntaxOk:            false,
            disposable:          false,
            roleAccount:         false,
            freeProvider:        false,
            hasMx:               false,
            smtpConnected:       false,
            mailboxExists:       null,
            catchAll:            null,
            smtpTimedOut:        false,
            mxAttempts:          0,
            managedMailProvider: null,
          },
          suggestion: null,
          normalized: null,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, emails.length) }, () => worker()),
  );
  return results;
}

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  const { emails } = await parseJson(req, bulkSchema);

  const results = await verifyAll(emails);

  // Summary counts make the UI's KPI strip trivial — no client-side reduce.
  const summary = results.reduce(
    (acc, r) => {
      acc[r.verdict.toLowerCase() as 'valid' | 'invalid' | 'pending']++;
      return acc;
    },
    { valid: 0, invalid: 0, pending: 0 },
  );

  return NextResponse.json({
    ok:      true,
    total:   results.length,
    summary,
    results,
  });
});
