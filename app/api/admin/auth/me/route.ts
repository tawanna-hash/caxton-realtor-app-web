/**
 * GET /api/admin/auth/me
 * Return the current admin's profile. 401 if not signed in.
 *
 * Most server-side admin gates should call `requireAdmin()` directly instead
 * of round-tripping through this endpoint. It exists for client components
 * that need to verify session state before rendering.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { query } from '@/lib/server/db/neon';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  const session = await requireAdmin();
  const rows = await query<{ id: string; email: string; full_name: string }>(
    `SELECT id, email, full_name FROM admins WHERE id = $1`,
    [session.adminId],
  );

  const admin = rows[0];
  if (!admin) throw new ApiError(404, 'Admin not found');

  return NextResponse.json({
    admin: { id: admin.id, email: admin.email, fullName: admin.full_name },
  });
});
