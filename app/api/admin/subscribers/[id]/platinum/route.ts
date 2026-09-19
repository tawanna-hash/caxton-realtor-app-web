import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ApiError } from '@/lib/server/error';
import { getSubscriberById } from '@/lib/server/subscribers-store';
import { getPlatinumAccess, setAdminPlatinumAccess } from '@/lib/server/platinum-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ active: z.boolean() }).strict();

export const GET = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) throw new ApiError(400, 'Invalid subscriber id');
  const subscriber = await getSubscriberById(parsed.data.id);
  if (!subscriber) throw new ApiError(404, 'Subscriber not found');
  const platinum = await getPlatinumAccess(parsed.data.id);
  return NextResponse.json({ platinum });
});

export const PATCH = withAdminTracking(async (req: Request, ctx: Ctx) => {
  await requireAdmin();
  const params = paramsSchema.safeParse(await ctx.params);
  const body = bodySchema.safeParse(await req.json());
  if (!params.success || !body.success) throw new ApiError(400, 'Invalid Platinum access request');
  const subscriber = await getSubscriberById(params.data.id);
  if (!subscriber) throw new ApiError(404, 'Subscriber not found');
  const platinum = await setAdminPlatinumAccess(params.data.id, body.data.active);
  return NextResponse.json({ platinum });
});
