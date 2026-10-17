// PATCH /api/portal/credentials — change login email and/or password.
// If a password already exists, current_password is required for any change.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { hashPassword } from '@/lib/server/auth/passwords';
import { ApiError, withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  login_email: z.string().trim().toLowerCase().email('Enter a valid email').max(320).optional(),
  current_password: z.string().max(200).optional(),
  new_password: z.string().min(10, 'Use at least 10 characters').max(200).optional(),
});

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');
  const body = schema.parse(await req.json());
  if (!body.login_email && !body.new_password) throw new ApiError(400, 'Nothing to update');

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT portal_email, portal_password_hash FROM advertisers WHERE id = ${user.advertiser_id}
  `) as unknown as { portal_email: string | null; portal_password_hash: string | null }[];
  const row = rows[0];
  if (!row) throw new ApiError(404, 'Account not found');

  if (row.portal_password_hash) {
    if (!body.current_password || !(await bcrypt.compare(body.current_password, row.portal_password_hash))) {
      throw new ApiError(403, 'Current password is incorrect');
    }
  }

  const updated: string[] = [];
  if (body.login_email && body.login_email !== (row.portal_email ?? '').toLowerCase()) {
    const clash = (await sql`
      SELECT id FROM advertisers
       WHERE lower(portal_email) = ${body.login_email} AND id <> ${user.advertiser_id} LIMIT 1
    `) as unknown as unknown[];
    if (clash.length > 0) throw new ApiError(409, 'That login email is already in use');
    await sql`UPDATE advertisers SET portal_email = ${body.login_email} WHERE id = ${user.advertiser_id}`;
    updated.push('login_email');
  }
  if (body.new_password) {
    const hash = await hashPassword(body.new_password);
    await sql`
      UPDATE advertisers
         SET portal_password_hash = ${hash}, portal_failed_logins = 0, portal_locked_until = NULL
       WHERE id = ${user.advertiser_id}
    `;
    updated.push('password');
  }
  return NextResponse.json({ ok: true, updated });
});
