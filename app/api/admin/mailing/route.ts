// app/api/admin/mailing/route.ts
//
// GET  /api/admin/mailing?segment=manual-newsline-contacts&search=&sort=&dir=&limit=&offset=
//   List rows + total + segment counts
// POST /api/admin/mailing
//   Create a single row (admin manual add). Body fields match MailingContactInput.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  countBySegment,
  segmentStats,
  createMailingContact,
  isMailingSegment,
  isSortableColumn,
  listMailingContacts,
  segmentFromSlug,
  type MailingSegment,
} from '@/lib/mailing';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import {
  paginationSchema,
  parseQuery,
  parseJson,
} from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// Accepts either canonical ('manual-newsline') or slug ('manual-newsline-contacts') form,
// matching the legacy `resolveSegment` helper. Refined output is the
// canonical MailingSegment.
const segmentParam = z
  .string()
  .min(1)
  .transform((raw, ctx): MailingSegment => {
    if (isMailingSegment(raw)) return raw;
    const slug = segmentFromSlug(raw);
    if (slug) return slug;
    ctx.addIssue({ code: 'custom', message: 'invalid segment' });
    return z.NEVER;
  });

const listQuerySchema = paginationSchema.extend({
  segment: segmentParam,
  search:  z.string().trim().min(1).max(200).optional(),
  filter:  z.enum(['all', 'verified', 'pending']).optional(),
  tag:     z.string().trim().min(1).max(100).optional(),
  sort:    z.string().min(1).max(64).optional(),
  dir:     z.enum(['asc', 'desc']).default('desc'),
});

const createContactSchema = z.object({
  segment:        segmentParam,
  first_name:     z.string().max(200).nullable().optional(),
  last_name:      z.string().max(200).nullable().optional(),
  email:          z.string().email().max(320).nullable().optional(),
  phone:          z.string().max(50).nullable().optional(),
  company:        z.string().max(500).nullable().optional(),
  title:          z.string().max(200).nullable().optional(),
  license_number: z.string().max(100).nullable().optional(),
  address:        z.string().max(500).nullable().optional(),
  address_2:      z.string().max(500).nullable().optional(),
  city:           z.string().max(200).nullable().optional(),
  state:          z.string().max(50).nullable().optional(),
  zip:            z.string().max(20).nullable().optional(),
  website:        z.string().max(500).nullable().optional(),
  notes:          z.string().max(5000).nullable().optional(),
  source:         z.string().max(100).optional(),
  advertiser_id:  z.number().int().positive().nullable().optional(),
  tags:           z.array(z.string().max(100)).max(50).optional(),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const { segment, search, filter, tag, sort, dir, limit, offset } = parseQuery(req, listQuerySchema);

  // `sort` is a string from the query — narrow to the column whitelist
  // before passing into the SQL builder. Anything else is dropped.
  const safeSort = isSortableColumn(sort) ? sort : undefined;

  const { rows, total } = await listMailingContacts({
    segment,
    search,
    filter,
    tagFilter: tag,
    sort: safeSort,
    dir,
    limit,
    offset,
  });
  const counts = await countBySegment();
  const stats  = await segmentStats(segment);
  return NextResponse.json({ rows, total, counts, stats });
});

export const POST = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const input = await parseJson(req, createContactSchema);

  try {
    const row = await createMailingContact({
      segment:        input.segment,
      first_name:     input.first_name     ?? null,
      last_name:      input.last_name      ?? null,
      email:          input.email          ?? null,
      phone:          input.phone          ?? null,
      company:        input.company        ?? null,
      title:          input.title          ?? null,
      license_number: input.license_number ?? null,
      address:        input.address        ?? null,
      address_2:      input.address_2      ?? null,
      city:           input.city           ?? null,
      state:          input.state          ?? null,
      zip:            input.zip            ?? null,
      website:        input.website        ?? null,
      notes:          input.notes          ?? null,
      source:         input.source         ?? 'manual',
      advertiser_id:  input.advertiser_id  ?? null,
      tags:           input.tags,
    });
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create failed';
    throw new ApiError(500, message);
  }
});
