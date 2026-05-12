// app/api/admin/inventory/route.ts
// Admin endpoint: list builder_inventory rows filtered by status.
// Returns rows + counts per status (for the tab indicators).
//
// Auth: forwards the session cookie to the droplet GET /admin/auth/me,
// matching the pattern in app/api/admin/ads/upload-token/route.ts.
// Page layouts do NOT gate API routes in Next.js — auth must be inline.

import { NextRequest, NextResponse } from 'next/server';
import {
  listBuilderInventory,
  ensureBuilderInventorySchema,
  type Status,
} from '@/lib/builder-inventory';
import { neon } from '@neondatabase/serverless';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';
const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  const isAdmin = await verifyAdmin(cookieHeader);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureBuilderInventorySchema();

    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status') as Status | null;

    const VALID_STATUSES: Status[] = ['pending', 'active', 'rejected'];
    const status: Status =
      statusParam && VALID_STATUSES.includes(statusParam)
        ? statusParam
        : 'pending';

    const rows = await listBuilderInventory({ status, limit: 200 });

    // Fetch counts for all statuses in a single query.
    const countRows = (await sql`
      SELECT status, COUNT(*)::int AS count
      FROM builder_inventory
      GROUP BY status
    `) as { status: Status; count: number }[];

    const counts: Record<Status, number> = {
      pending: 0,
      active: 0,
      rejected: 0,
    };
    for (const r of countRows) counts[r.status] = r.count;

    return NextResponse.json({ rows, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin/inventory] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
