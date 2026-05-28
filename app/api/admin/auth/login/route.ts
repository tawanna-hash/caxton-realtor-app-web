/**
 * POST /api/admin/auth/login
 * Authenticate an admin with email + password, set caxton_admin_session cookie.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '@/lib/server/db/neon';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { signAdminSessionToken } from '@/lib/server/jwt';
import { setAdminSessionCookie } from '@/lib/server/auth/cookies';
import { getRequestIp, getRequestUserAgent } from '@/lib/server/auth/admin';
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

// Constant-time dummy bcrypt hash so login response time doesn't leak whether
// an email exists. cost=12 to match what real admin hashes use.
const DUMMY_HASH =
  '$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsaltinvalidsa';

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');
  const input = loginSchema.parse(await req.json());

  const rows = await query<{
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    active: boolean;
  }>(
    `SELECT id, email, password_hash, full_name, active
     FROM admins WHERE email = $1`,
    [input.email],
  );

  const admin = rows[0];
  const passwordHash = admin?.password_hash ?? DUMMY_HASH;
  const passwordValid = await bcrypt.compare(input.password, passwordHash);

  if (!admin || !admin.active || !passwordValid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  await query(
    `UPDATE admins SET last_login_at = NOW() WHERE id = $1`,
    [admin.id],
  );

  await query(
    `INSERT INTO admin_audit_log (admin_id, action, ip_address, user_agent)
     VALUES ($1, 'admin.login', $2, $3)`,
    [admin.id, await getRequestIp(), await getRequestUserAgent()],
  );

  const token = signAdminSessionToken({ adminId: admin.id, email: admin.email });

  const response = NextResponse.json({
    success: true,
    admin: { id: admin.id, email: admin.email, fullName: admin.full_name },
  });
  await setAdminSessionCookie(response, token);
  return response;
});
