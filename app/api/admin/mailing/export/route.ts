// app/api/admin/mailing/export/route.ts
//
// GET — download mailing rows for one segment as CSV (default), TSV, or JSON.
// Query params: ?segment=advertisers[&format=csv|tsv|json]

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  isMailingSegment,
  listMailingContacts,
  segmentFromSlug,
  slugFromSegment,
  type MailingSegment,
} from '@/lib/mailing';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseQuery } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'company',
  'title',
  'license_number',
  'address',
  'address_2',
  'city',
  'state',
  'zip',
  'website',
  'notes',
  'tag',
  'created_at',
] as const;

const exportQuerySchema = z.object({
  segment: z.string().min(1),
  format:  z.enum(['csv', 'tsv', 'json']).default('csv'),
  tag:     z.string().trim().min(1).max(100).optional(),
});

function csvCell(v: unknown, delim: string): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(delim) || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toDelimited(rows: Record<string, unknown>[], delim: string): string {
  const lines: string[] = [];
  lines.push(HEADERS.join(delim));
  for (const r of rows) {
    lines.push(HEADERS.map((h) => csvCell(r[h], delim)).join(delim));
  }
  return lines.join('\n');
}

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const { segment: segRaw, format, tag } = parseQuery(req, exportQuerySchema);

  const seg: MailingSegment | null = isMailingSegment(segRaw)
    ? segRaw
    : segmentFromSlug(segRaw);
  if (!seg) throw new ApiError(400, 'invalid segment');

  await ensureSchema();

  const { rows } = await listMailingContacts({
    segment: seg,
    tagFilter: tag,
    sort: 'created_at',
    dir: 'desc',
    limit: 500,
    offset: 0,
  });
  // For export we want all rows — paginate through to collect them.
  // Flatten the JSON tags array into a single human-friendly column.
  const flattenTag = (raw: unknown): string => {
    if (!Array.isArray(raw)) return '';
    const visible = (raw as unknown[])
      .filter((t): t is string => typeof t === 'string')
      .filter((t) => !t.startsWith('_was:') && t !== 'staff' && t !== 'advertiser');
    return visible.join(', ');
  };
  const expandRow = (r: Record<string, unknown>): Record<string, unknown> => ({
    ...r,
    tag: flattenTag((r as { tags?: unknown }).tags),
  });
  const all: Record<string, unknown>[] = (rows as unknown as Record<string, unknown>[]).map(expandRow);
  let offset = rows.length;
  // Cap exports at 50k to avoid runaway responses.
  while (offset < 50_000) {
    const page = await listMailingContacts({
      segment: seg,
      tagFilter: tag,
      sort: 'created_at',
      dir: 'desc',
      limit: 500,
      offset,
    });
    if (page.rows.length === 0) break;
    for (const r of page.rows) all.push(expandRow(r as unknown as Record<string, unknown>));
    offset += page.rows.length;
    if (page.rows.length < 500) break;
  }

  const filenameBase = `mailing-${slugFromSegment(seg)}-${new Date().toISOString().slice(0, 10)}`;

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ segment: seg, rows: all }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
      },
    });
  }
  if (format === 'tsv') {
    return new NextResponse(toDelimited(all, '\t'), {
      headers: {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.tsv"`,
      },
    });
  }
  // Default: CSV
  return new NextResponse(toDelimited(all, ','), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
    },
  });
});
