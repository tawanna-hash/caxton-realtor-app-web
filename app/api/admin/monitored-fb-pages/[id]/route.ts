/**
 * /api/admin/monitored-fb-pages/[id]
 *   PATCH  — toggle is_active { is_active: boolean }
 *   DELETE — remove the monitored page row entirely
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { ensureSchema } from '@/lib/db';
import {
  setMonitoredFbPageActive,
  deleteMonitoredFbPage,
} from '@/lib/server/monitored-fb-pages-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export const PATCH = withErrorHandling(async (req: Request, ctx: RouteCtx) => {
  await requireAdmin();
  await ensureSchema();
  const { id } = await ctx.params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new ApiError(400, 'invalid id');
  }
  const body = (await req.json()) as { is_active?: boolean };
  if (typeof body.is_active !== 'boolean') {
    throw new ApiError(400, 'is_active (boolean) is required');
  }
  const page = await setMonitoredFbPageActive(numericId, body.is_active);
  if (!page) throw new ApiError(404, 'monitored page not found');
  return NextResponse.json({ page });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: RouteCtx) => {
  await requireAdmin();
  await ensureSchema();
  const { id } = await ctx.params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new ApiError(400, 'invalid id');
  }
  const deleted = await deleteMonitoredFbPage(numericId);
  if (!deleted) throw new ApiError(404, 'monitored page not found');
  return NextResponse.json({ ok: true });
});
