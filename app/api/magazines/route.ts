// Public read-only API for the magazine carousel.
// Returns magazines for a publication, newest first, only those with page_urls populated.

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const publication = req.nextUrl.searchParams.get('publication') || 'austin';

  if (!['austin', 'san_antonio'].includes(publication)) {
    return NextResponse.json({ error: 'invalid publication' }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, publication, year, month, issue_label,
             cover_url, reader_url, page_urls, page_count, sort_date
      FROM magazines
      WHERE publication = ${publication}
        AND page_count > 0
      ORDER BY sort_date DESC
      LIMIT 50
    `;
    return NextResponse.json(rows);
  } catch (err: any) {
    console.error('[api/magazines] query failed:', err?.message);
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
