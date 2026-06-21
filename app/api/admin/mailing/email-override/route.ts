// app/api/admin/mailing/email-override/route.ts
//
// POST /api/admin/mailing/email-override
//   Body: { id: string, status: 'Valid' | 'Invalid' | null, reason?: string }
//
// Set or clear a manual override of the email verification verdict on a
// single mailing_contacts row. The override columns are independent from
// email_status (the SMTP-probe verdict) so a future re-probe doesn't
// silently clear the manual decision.
//
// Used by the Mark-as-Valid / Mark-as-Invalid / Clear-override buttons
// in the mailing-segment row drawer. See lib/server/mailing/verification.ts
// for the transition rules and audit logging.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { persistEmailOverride } from '@/lib/mailing';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { uuidSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Status of `null` means "clear the override". We keep the reason field
// optional but capped — it's a short note like "phone-confirmed 6/21",
// not a journal entry. The notes textarea on the drawer is the right
// home for longer narrative.
const overrideSchema = z.object({
  id:     uuidSchema,
  status: z.union([z.literal('Valid'), z.literal('Invalid'), z.null()]),
  reason: z.string().trim().max(280).optional().nullable(),
});

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await requireAdmin();
  const { id, status, reason } = await parseJson(req, overrideSchema);

  await ensureSchema();

  const outcome = await persistEmailOverride(id, {
    status,
    by:     admin.email,
    reason: reason ?? null,
  });

  if (!outcome.ok) {
    // not_found → 404, forbidden_transition → 409. Both are user-facing
    // errors the drawer should surface as a toast.
    const httpCode = outcome.code === 'not_found' ? 404 : 409;
    throw new ApiError(httpCode, outcome.message);
  }

  return NextResponse.json({
    ok:  true,
    row: outcome.row,
  });
});
