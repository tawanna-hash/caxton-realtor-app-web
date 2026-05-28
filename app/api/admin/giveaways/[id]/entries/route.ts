/**
 * /api/admin/giveaways/:id/entries
 *   GET — paginated list of realtors who have entered, with ticket counts.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { listGiveawayEntries } from '@/lib/server/giveaways-store';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);

  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50, 200);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const entries = await listGiveawayEntries(id, limit, offset);
  return NextResponse.json({ entries, limit, offset });
});
