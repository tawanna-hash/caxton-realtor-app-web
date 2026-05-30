// app/api/admin/mailing/holding/route.ts
//
// GET /api/admin/mailing/holding?search=&filter=&sort=&dir=&limit=&offset=
//   List holding-stage contacts + total + verified/pending counts.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  countHolding,
  isSortableColumn,
  listHoldingContacts,
} from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const url = new URL(req.url);
    const search = url.searchParams.get('search') ?? undefined;
    const filterRaw = url.searchParams.get('filter');
    const filter: 'all' | 'verified' | 'pending' =
      filterRaw === 'verified' || filterRaw === 'pending' ? filterRaw : 'all';
    const sortRaw = url.searchParams.get('sort');
    const sort = isSortableColumn(sortRaw) ? sortRaw : undefined;
    const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const { rows, total } = await listHoldingContacts({
      search,
      filter,
      sort,
      dir,
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    const counts = await countHolding();
    return NextResponse.json({ rows, total, counts });
  } catch (err) {
    console.error('[admin/mailing/holding GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}
