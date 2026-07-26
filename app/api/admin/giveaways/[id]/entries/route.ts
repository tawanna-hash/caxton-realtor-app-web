/**
 * /api/admin/giveaways/:id/entries
 *   GET    — paginated list of realtors who have entered, with ticket counts.
 *   POST   — manually add an entry for a subscriber (by email + optional ruleId).
 *   DELETE — remove all entries for a realtor in this giveaway.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import {
  listGiveawayEntries,
  countGiveawayEntries,
  findRealtorByEmail,
  addGiveawayEntry,
  deleteGiveawayEntries,
} from '@/lib/server/giveaways-store';
import { logAudit } from '@/lib/server/audit';
import { giveawayIdParamSchema, addEntrySchema } from '@/lib/server/schemas/giveaways';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (req: Request, ctx: Ctx) => {
  await requireAdmin();
  await ensureSchema();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);

  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50, 200);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const [entries, total] = await Promise.all([
    listGiveawayEntries(id, limit, offset),
    countGiveawayEntries(id),
  ]);
  return NextResponse.json({ entries, total, limit, offset });
});

export const POST = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const input = addEntrySchema.parse(await req.json());

  const realtor = await findRealtorByEmail(input.email);
  if (!realtor) {
    throw new ApiError(404, `No subscriber found with email "${input.email}"`);
  }

  if (input.ruleId) {
    // Single rule entry
    const result = await addGiveawayEntry(id, realtor.id, input.ruleId);
    await logAudit({
      adminId: admin.adminId,
      action: 'giveaway.entry.add',
      entityType: 'giveaway_entry',
      entityId: result.ok ? result.id : null,
      afterState: { giveawayId: id, realtorId: realtor.id, ruleId: input.ruleId, created: result.ok },
      ipAddress: await getRequestIp(),
    });
    return NextResponse.json(
      { realtor, added: result.ok ? 1 : 0, duplicate: !result.ok },
      { status: result.ok ? 201 : 200 },
    );
  }

  // No rule specified — add entries for ALL rules on the giveaway
  const { getGiveawayDetail } = await import('@/lib/server/giveaways-store');
  const detail = await getGiveawayDetail(id);
  if (!detail) throw new ApiError(404, 'Giveaway not found');

  let added = 0;
  for (const rule of detail.rules as Array<{ id: string }>) {
    const result = await addGiveawayEntry(id, realtor.id, rule.id);
    if (result.ok) added++;
  }

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.entry.add',
    entityType: 'giveaway_entry',
    entityId: null,
    afterState: { giveawayId: id, realtorId: realtor.id, added },
    ipAddress: await getRequestIp(),
  });

  return NextResponse.json({ realtor, added }, { status: 201 });
});

export const DELETE = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);

  const url = new URL(req.url);
  const realtorId = url.searchParams.get('realtorId');
  if (!realtorId) throw new ApiError(400, 'Missing realtorId query parameter');

  const deleted = await deleteGiveawayEntries(id, realtorId);

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.entry.delete',
    entityType: 'giveaway_entry',
    entityId: null,
    afterState: { giveawayId: id, realtorId, deleted },
    ipAddress: await getRequestIp(),
  });

  return NextResponse.json({ deleted });
});
