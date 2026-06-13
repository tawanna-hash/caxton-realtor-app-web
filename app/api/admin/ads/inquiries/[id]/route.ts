/**
 * /api/admin/ads/inquiries/[id]
 *   GET   — fetch a single inquiry by id
 *   PATCH — update status / assignee / takeover / notes
 *
 * Used by the inquiry detail drawer on /admin/ads/inquiries. Auth via
 * requireAdmin().
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { logAudit } from '@/lib/server/audit';
import {
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

export const GET = withErrorHandling(async (
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

export const PATCH = withErrorHandling(async (
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
