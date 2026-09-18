// app/api/admin/team/[id]/route.ts
//
// Owner-only admin account management for a single admin.
//
// PATCH  — set active/inactive. Deactivating (active: false) is the normal
//          offboarding path: it blocks login immediately (see
//          app/api/admin/auth/login/route.ts's `!admin.active` check) while
//          keeping the row — and every admin_audit_log entry pointing at
//          it — intact for compliance history.
// DELETE — hard delete. Rare case (duplicate/mistaken account). Blocked
//          for the owner account itself and requires the target to already
//          be inactive, so nobody can delete an active login out from
//          under someone by mistake.

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db/neon';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { isOwnerAdmin } from '@/lib/server/auth/owner';
import { logAudit } from '@/lib/server/audit';
import { updateAdminStatusSchema } from '@/lib/server/schemas/auth-admin-team';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadTarget(id: string) {
  const rows = await query<{ id: string; email: string; full_name: string; active: boolean }>(
    `SELECT id, email, full_name, active FROM admins WHERE id = $1`,
    [id],
  );
  const target = rows[0];
  if (!target) throw new ApiError(404, 'admin not found');
  return target;
}

export const PATCH = withAdminTracking(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!isOwnerAdmin(admin)) {
    throw new ApiError(403, 'Only the account owner can manage admin access');
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid id');

  const input = updateAdminStatusSchema.parse(await req.json());
  const target = await loadTarget(id);

  if (isOwnerAdmin({ email: target.email }) && !input.active) {
    throw new ApiError(400, 'The owner account cannot be deactivated');
  }

  await query(`UPDATE admins SET active = $1 WHERE id = $2`, [input.active, id]);

  const ip = await getRequestIp();
  await logAudit({
    adminId: admin.adminId,
    action: input.active ? 'admin.team_member_reactivated' : 'admin.team_member_deactivated',
    entityType: 'admin',
    entityId: id,
    beforeState: { active: target.active },
    afterState: { active: input.active, email: target.email, fullName: target.full_name },
    ipAddress: ip,
  });

  return NextResponse.json({
    ok: true,
    admin: { id: target.id, email: target.email, fullName: target.full_name, active: input.active },
  });
});

export const DELETE = withAdminTracking(async (
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!isOwnerAdmin(admin)) {
    throw new ApiError(403, 'Only the account owner can manage admin access');
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid id');

  const target = await loadTarget(id);

  if (isOwnerAdmin({ email: target.email })) {
    throw new ApiError(400, 'The owner account cannot be deleted');
  }
  if (target.active) {
    throw new ApiError(400, 'Deactivate this admin before deleting the account');
  }

  const ip = await getRequestIp();
  // Log before deleting. entity_id is a plain uuid column (not an FK to
  // admins — see lib/server/audit.ts), so this row survives the delete
  // below; admin_id is the ACTING admin (the owner), and the deleted
  // account's identity is captured in before_state for the audit trail.
  await logAudit({
    adminId: admin.adminId,
    action: 'admin.team_member_deleted',
    entityType: 'admin',
    entityId: id,
    beforeState: { email: target.email, fullName: target.full_name },
    ipAddress: ip,
  });

  await query(`DELETE FROM admins WHERE id = $1`, [id]);

  return NextResponse.json({ ok: true, deleted: { id: target.id, email: target.email } });
});
