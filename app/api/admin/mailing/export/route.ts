// app/api/admin/mailing/export/route.ts
//
// GET — download mailing rows for one segment as CSV (default), TSV, or JSON.
// Query params: ?segment=advertisers[&format=csv|tsv|json]

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  isMailingSegment,
  listMailingContacts,
  segmentFromSlug,
  slugFromSegment,
  type MailingSegment,
} from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

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
  'created_at',
] as const;

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

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const url = new URL(req.url);
    const segRaw = url.searchParams.get('segment');
    const seg: MailingSegment | null = segRaw
      ? isMailingSegment(segRaw)
        ? segRaw
        : segmentFromSlug(segRaw)
      : null;
    if (!seg) {
      return NextResponse.json({ error: 'invalid segment' }, { status: 400 });
    }
    const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();
    const { rows } = await listMailingContacts({
      segment: seg,
      sort: 'created_at',
      dir: 'desc',
      limit: 500,
      offset: 0,
    });
    // For export we want all rows — paginate through to collect them.
    const all: Record<string, unknown>[] = rows as unknown as Record<string, unknown>[];
    let offset = rows.length;
    // Cap exports at 50k to avoid runaway responses.
    while (offset < 50_000) {
      const page = await listMailingContacts({
        segment: seg,
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
  } catch (err) {
    console.error('[admin/mailing export]', errMessage(err));
    return NextResponse.json({ error: 'export failed', detail: errMessage(err) }, { status: 500 });
  }
}
