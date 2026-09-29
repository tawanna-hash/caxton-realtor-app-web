/**
 * /api/admin/ga4-auth/properties
 *
 * GET    — connection status + GA4 properties the connected account can read
 * POST   — { properties: [{ id, name }] } select the properties the dashboard sums
 * DELETE — disconnect GA4 (removes the stored token)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseJson } from '@/lib/server/schemas/_common';
import { disconnectGa4, getGa4Connection, listGa4Properties, selectGa4Properties } from '@/lib/server/ga4-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const selectSchema = z.object({
  properties: z.array(z.object({ id: z.string().regex(/^\d+$/), name: z.string().trim().min(1).max(200) })).max(20),
});

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const connection = await getGa4Connection();
  if (!connection) return NextResponse.json({ ok: true, connection: null, properties: [] });
  let properties: Awaited<ReturnType<typeof listGa4Properties>> = [];
  let error: string | null = null;
  try { properties = await listGa4Properties(); } catch (err) { error = err instanceof Error ? err.message : String(err); }
  return NextResponse.json({ ok: true, connection, properties, error });
});

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const body = await parseJson(req, selectSchema);
  await selectGa4Properties(body.properties);
  return NextResponse.json({ ok: true });
});

export const DELETE = withAdminTracking(async () => {
  await requireAdmin();
  await disconnectGa4();
  return NextResponse.json({ ok: true });
});
