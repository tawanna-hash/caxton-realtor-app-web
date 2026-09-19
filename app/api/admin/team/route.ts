// app/api/admin/team/route.ts
//
// Owner-only admin account roster. Lets the account owner see who has
// dashboard login access and add a new admin (who gets a set-password
// email — see /api/admin/auth/reset-password for the consuming flow,
// reused here for the initial invite).
//
// GET  — list every admin (owner-only).
// POST — create a new admin + email them a set-password link (owner-only).
//
// Compliance intent: this is the "who currently has login access to
// realtynewsnow.app admin" system of record. Deactivating (PATCH on
// /api/admin/team/[id]) is the normal offboarding path when someone
// leaves the company — it blocks login immediately while keeping their
// name attached to past admin_audit_log rows. DELETE fully removes the
// account for the rare case a duplicate/mistaken account needs erasing.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { query } from '@/lib/server/db/neon';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { requireAdmin, getRequestIp, getRequestUserAgent } from '@/lib/server/auth/admin';
import { isOwnerAdmin } from '@/lib/server/auth/owner';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAudit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';
import { getEmailProvider } from '@/lib/server/email';
import { renderAdminInviteEmail } from '@/lib/server/email/templates';
import { createAdminSchema } from '@/lib/server/schemas/auth-admin-team';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Invite links live longer than a forgotten-password reset (15 min) since
// there's no urgency pressure prompting the new admin to act immediately.
const INVITE_EXPIRY_HOURS = 48;

interface AdminRow {
  id: string;
  email: string;
  full_name: string;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export const GET = withAdminTracking(async () => {
  const admin = await requireAdmin();
  if (!isOwnerAdmin(admin)) {
    throw new ApiError(403, 'Only the account owner can manage admin access');
  }

  const rows = await query<AdminRow>(
    `SELECT id, email, full_name, active, last_login_at::text AS last_login_at,
            created_at::text AS created_at
       FROM admins
      ORDER BY full_name ASC`,
  );

  return NextResponse.json({
    admins: rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      active: r.active,
      lastLoginAt: r.last_login_at,
      createdAt: r.created_at,
      isOwner: isOwnerAdmin({ email: r.email }),
    })),
  });
});

export const POST = withAdminTracking(async (req: NextRequest) => {
  const admin = await requireAdmin();
  if (!isOwnerAdmin(admin)) {
    throw new ApiError(403, 'Only the account owner can manage admin access');
  }
  await rateLimit('adminAuth');

  const input = createAdminSchema.parse(await req.json());
  const ip = await getRequestIp();
  const userAgent = await getRequestUserAgent();

  const existing = await query<{ id: string }>(
    `SELECT id FROM admins WHERE email = $1`,
    [input.email],
  );
  if (existing.length > 0) {
    throw new ApiError(409, 'An admin with this email already exists');
  }

  // No usable password at creation time — a random, never-communicated
  // hash — the invite link below is the only way in until they set one.
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

  const inserted = await query<{ id: string }>(
    `INSERT INTO admins (email, password_hash, full_name, active)
     VALUES ($1, $2, $3, true)
     RETURNING id`,
    [input.email, placeholderHash, input.fullName],
  );
  const newAdminId = inserted[0].id;

  await logAudit({
    adminId: admin.adminId,
    action: 'admin.team_member_added',
    entityType: 'admin',
    entityId: newAdminId,
    afterState: { email: input.email, fullName: input.fullName },
    ipAddress: ip,
  });

  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  await query(
    `INSERT INTO password_reset_tokens (admin_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [newAdminId, tokenHash, expiresAt, ip, userAgent],
  );

  const h = await headers();
  const host = h.get('host') ?? 'realtynewsnow.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
  const setPasswordUrl = `${base}/admin/r/${encodeURIComponent(raw)}`;

  const template = renderAdminInviteEmail({
    fullName: input.fullName,
    setPasswordUrl,
    expiryHours: INVITE_EXPIRY_HOURS,
    invitedBy: admin.email,
  });

  const provider = getEmailProvider();
  const result = await provider.send({
    to: { email: input.email, name: input.fullName },
    subject: template.subject,
    text: template.text,
    html: template.html,
    emailType: 'admin_team_invite',
    tags: ['admin_team_invite'],
    disableTracking: true,
  });

  if (!result.success) {
    logger.error({ email: input.email, error: result.error }, 'Failed to send admin invite email');
  } else {
    await query(
      `INSERT INTO email_log (email_type, provider, provider_message_id, to_address, subject)
       VALUES ($1, $2, $3, $4, $5)`,
      ['admin_team_invite', provider.name, result.messageId ?? null, input.email, template.subject],
    );
  }

  return NextResponse.json({
    ok: true,
    admin: { id: newAdminId, email: input.email, fullName: input.fullName },
    inviteEmailSent: result.success,
  });
});
