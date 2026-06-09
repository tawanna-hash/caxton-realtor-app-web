// app/api/admin/mailing/holding/route.ts
//
// GET /api/admin/mailing/holding?search=&filter=&sort=&dir=&limit=&offset=
//   List holding-stage contacts + total + verified/pending counts.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  countHolding,
  isSortableColumn,
  listHoldingContacts,
} from '@/lib/mailing';
import { withErrorHandling } from '@/lib/server/error';
import { paginationSchema, parseQuery } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listHoldingQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  filter: z.enum(['all', 'verified', 'pending']).default('all'),
  source: z.string().trim().min(1).max(64).optional(),
  sort:   z.string().min(1).max(64).optional(),
  dir:    z.enum(['asc', 'desc']).default('desc'),
});

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const { search, filter, source, sort, dir, limit, offset } = parseQuery(req, listHoldingQuerySchema);
  const safeSort = isSortableColumn(sort) ? sort : undefined;

  const { rows, total } = await listHoldingContacts({
    search,
    filter,
    source,
    sort: safeSort,
    dir,
    limit,
    offset,
  });
  const counts = await countHolding(source);
  return NextResponse.json({ rows, total, counts });
});
