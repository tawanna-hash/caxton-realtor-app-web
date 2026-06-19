// app/api/admin/mailing/holding/export/route.ts
//
// GET — download holding-stage mailing rows for one external_source as
// CSV (default), TSV, or JSON.
// Query params: ?source=ramco-sabor|unlockmls[&format=csv|tsv|json]

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { listHoldingContacts } from '@/lib/mailing';
import { withErrorHandling, ApiError } from '@/lib/server/error';
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
  'addr_status',
  'email_status',
  'created_at',
] as const;

const exportQuerySchema = z.object({
  source: z.enum(['ramco-sabor', 'unlockmls']),
  format: z.enum(['csv', 'tsv', 'json']).default('csv'),
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

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  const { source, format } = parseQuery(req, exportQuerySchema);

  await ensureSchema();

  const all: Record<string, unknown>[] = [];
  let offset = 0;
  while (offset < 50_000) {
    const page = await listHoldingContacts({
      source,
      sort: 'created_at',
      dir: 'desc',
      limit: 500,
      offset,
    });
    if (page.rows.length === 0) break;
    for (const r of page.rows) all.push(r as unknown as Record<string, unknown>);
    offset += page.rows.length;
    if (page.rows.length < 500) break;
  }

  if (!all.length) {
    throw new ApiError(404, `No rows found for source=${source}`);
  }

  const filenameBase = `mailing-holding-${source}-${new Date().toISOString().slice(0, 10)}`;

  if (format === 'json') {
    return new NextResponse(JSON.stringify(all, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
      },
    });
  }

  const delim = format === 'tsv' ? '\t' : ',';
  const body = toDelimited(all, delim);
  const mime = format === 'tsv' ? 'text/tab-separated-values' : 'text/csv';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': `${mime}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${filenameBase}.${format}"`,
    },
  });
});
