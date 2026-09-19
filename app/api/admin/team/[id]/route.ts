// app/api/admin/team/[id]/route.ts
//
// Owner-only admin account management for a single admin.
//
// PATCH  — set active/inactive, OR edit name/email. Distinguished by which
//          fields the body contains (see the two schemas below).
//            - { active } — the normal offboarding path: deactivating
//              blocks login immediately (see
//              app/api/admin/auth/login/route.ts's `!admin.active` check)
//              while keeping the row — and every admin_audit_log entry
//              pointing at it — intact for compliance history.
//            - { email, fullName } — edits the admin's profile. Blocked
//              for the owner's own row: the owner identity is hard-pinned
//              by email in lib/server/auth/owner.ts, and the current
//              session JWT snapshots email at login time (see
//              lib/server/auth/admin.ts), so the owner changing their own
//              email here would desync from their own live session until
//              they log back in. Editing a non-owner's email is safe —
//              their live session (if any) keeps working under the old
//              email until they next log in, same tradeoff any auth
//              system takes on an email change.
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
import { updateAdminStatusSchema, updateAdminProfileSchema } from '@/lib/server/schemas/auth-admin-team';

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

  const body = await req.json();
  const target = await loadTarget(id);

  // Distinguish a status toggle from a profile edit by which field the
  // body carries. The two actions have separate schemas and rules, so
  // route to separate handling rather than merging them into one schema.
  if (typeof body?.active === 'boolean') {
    const input = updateAdminStatusSchema.parse(body);

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
  }

  // Profile edit (name / email).
  const input = updateAdminProfileSchema.parse(body);

  // The owner's own row is edited nowhere in this UI — see the file-header
  // comment for why an email change would desync the owner's live session
  // from lib/server/auth/owner.ts's hard-pinned identity check.
  if (isOwnerAdmin({ email: target.email })) {
    throw new ApiError(400, 'The owner account cannot be edited here');
  }

  try {
    await query(
      `UPDATE admins SET email = $1, full_name = $2 WHERE id = $3`,
      [input.email, input.fullName, id],
    );
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505') {
      throw new ApiError(409, `${input.email} is already in use by another admin`);
    }
    throw err;
  }

  const ip = await getRequestIp();
  await logAudit({
    adminId: admin.adminId,
    action: 'admin.team_member_updated',
    entityType: 'admin',
    entityId: id,
    beforeState: { email: target.email, fullName: target.full_name },
    afterState: { email: input.email, fullName: input.fullName },
    ipAddress: ip,
  });

  return NextResponse.json({
    ok: true,
    admin: { id: target.id, email: input.email, fullName: input.fullName, active: target.active },
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
