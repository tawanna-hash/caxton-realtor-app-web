// Public read-only API for the magazine carousel.
// Returns magazines for a publication, newest first, only those with page_urls populated.

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('publication') || 'austin';
  // Dashboard uses 'realtyline'/'newsline'; DB uses 'austin'/'san_antonio'. Accept both.
  const PUB_ALIAS: Record<string, string> = {
    realtyline: 'austin',
    newsline: 'san_antonio',
    austin: 'austin',
    san_antonio: 'san_antonio',
  };
  const publication = PUB_ALIAS[raw];

  if (!publication) {
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
