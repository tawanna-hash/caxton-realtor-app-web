/**
 * /api/admin/ads/inquiries/[id]
 *   GET    — fetch a single inquiry by id
 *   PATCH  — update status / assignee / takeover / notes
 *   DELETE — permanently remove the inquiry (test rows, spam cleanup)
 *
 * Used by the inquiry detail drawer on /admin/ads/inquiries. Auth via
 * requireAdmin().
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { logAudit } from '@/lib/server/audit';
import {
  deleteAdInquiry,
  getAdInquiry,
  updateAdInquiry,
  type AdInquiryStatus,
} from '@/lib/server/ad-inquiries-store';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

const STATUS_VALUES: readonly AdInquiryStatus[] = [
  'new',
  'replied',
  'quoted',
  'won',
  'lost',
  'spam',
] as const;

const patchSchema = z.object({
  status: z.enum(STATUS_VALUES as unknown as [AdInquiryStatus, ...AdInquiryStatus[]]).optional(),
  assignee: z.string().trim().max(200).nullable().optional(),
  takeover: z.boolean().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

export const GET = withAdminTracking(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  await requireAdmin();
  await ensureSchema();
  const { id } = await ctx.params;
  const row = await getAdInquiry(id);
  if (!row) throw new ApiError(404, 'inquiry_not_found');
  return NextResponse.json({ inquiry: row });
});

export const PATCH = withAdminTracking(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const { id } = await ctx.params;

  const before = await getAdInquiry(id);
  if (!before) throw new ApiError(404, 'inquiry_not_found');

  const body = patchSchema.parse(await req.json());
  if (
    body.status === undefined &&
    body.assignee === undefined &&
    body.takeover === undefined &&
    body.notes === undefined
  ) {
    throw new ApiError(400, 'no_fields_to_update');
  }

  const updated = await updateAdInquiry(id, body);
  if (!updated) throw new ApiError(404, 'inquiry_not_found');

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_inquiry.updated',
      entityType: 'ad_inquiry',
      entityId: id,
      beforeState: {
        status: before.status,
        assignee: before.assignee,
        takeover: before.takeover,
        notes: before.notes,
      },
      afterState: {
        status: updated.status,
        assignee: updated.assignee,
        takeover: updated.takeover,
        notes: updated.notes,
      },
    });
  } catch {
    // Audit failures must not block the user's update.
  }

  return NextResponse.json({ inquiry: updated });
});

export const DELETE = withAdminTracking(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const { id } = await ctx.params;

  // Capture the row before removal so the audit log keeps a snapshot of
  // what was deleted. Returning 404 here matches the PATCH behavior so
  // the client can disambiguate "already gone" from "server error".
  const before = await getAdInquiry(id);
  if (!before) throw new ApiError(404, 'inquiry_not_found');

  const removed = await deleteAdInquiry(id);
  if (!removed) throw new ApiError(404, 'inquiry_not_found');

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_inquiry.deleted',
      entityType: 'ad_inquiry',
      entityId: id,
      beforeState: {
        channel: before.channel,
        name: before.name,
        email: before.email,
        status: before.status,
        assignee: before.assignee,
        notes: before.notes,
      },
      afterState: null,
    });
  } catch {
    // Audit failures must not block the delete from completing.
  }

  return NextResponse.json({ ok: true, id });
});
