// POST /api/portal/reset { token, password }
// Partner password reset, step 2: validates the emailed single-use token, sets
// the new password, clears any login lockout, and consumes the link.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { hashMagicLinkToken, isLinkConsumable } from '@/lib/portal';
import { hashPassword } from '@/lib/server/auth/passwords';
import { ApiError, withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = schema.parse(await req.json());
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, advertiser_id, link_expires_at, consumed_at, revoked_at
      FROM portal_magic_links
     WHERE token_hash = ${hashMagicLinkToken(body.token)} AND created_by = 'portal-reset'
  `) as unknown as { id: string; advertiser_id: number; link_expires_at: string; consumed_at: string | null; revoked_at: string | null }[];
  const link = rows[0];
  if (!link || !isLinkConsumable(link)) throw new ApiError(400, 'This reset link is invalid or has expired. Request a new one.');

  const hash = await hashPassword(body.password);
  // Consume first so a double submit cannot reuse the link.
  const claimed = (await sql`
    UPDATE portal_magic_links SET consumed_at = NOW() WHERE id = ${link.id} AND consumed_at IS NULL RETURNING id
  `) as unknown as unknown[];
  if (claimed.length === 0) throw new ApiError(400, 'This reset link has already been used.');
  await sql`
    UPDATE advertisers
       SET portal_password_hash = ${hash}, portal_failed_logins = 0, portal_locked_until = NULL
     WHERE id = ${link.advertiser_id}
  `;
  return NextResponse.json({ ok: true });
});
