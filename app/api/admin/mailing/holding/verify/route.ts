// app/api/admin/mailing/holding/verify/route.ts
//
// POST /api/admin/mailing/holding/verify
//   Body: { id: string, field: 'addr' | 'email', status?: 'Valid' | 'Invalid' | 'Pending' }
//   Marks a single holding row's address or email as verified / invalid.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { markAddrVerified, markEmailVerified } from '@/lib/mailing';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { uuidSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  id:     uuidSchema,
  field:  z.enum(['addr', 'email']),
  status: z.enum(['Valid', 'Invalid', 'Pending']).default('Valid'),
});

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const { id, field, status } = await parseJson(req, verifySchema);
  const ok = field === 'addr'
    ? await markAddrVerified(id, status)
    : await markEmailVerified(id, status);
  if (!ok) throw new ApiError(404, 'not found');
  return NextResponse.json({ ok: true });
});
