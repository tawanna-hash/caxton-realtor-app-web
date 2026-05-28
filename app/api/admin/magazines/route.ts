// app/api/admin/magazines/route.ts
//
// Admin endpoints:
//   GET  — list all magazines, newest first
//   POST — create a new magazine row (uploads happen client-side first)
//
// The upload form sends camelCase keys (issuelabel, sortdate, etc.)
// This route accepts both camelCase and snake_case for each field.

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getServerApiBase } from '@/lib/server-api-base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const API_URL = await getServerApiBase();
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

const PUB_ALIAS: Record<string, string> = {
  realtyline: 'austin',
  newsline: 'san_antonio',
  austin: 'austin',
  san_antonio: 'san_antonio',
};

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, publication, year, month, issue_label,
             cover_url, reader_url, page_urls, page_count, sort_date
      FROM magazines
      ORDER BY sort_date DESC NULLS LAST, id DESC
    `;
    return NextResponse.json({ magazines: rows });
  } catch (err: unknown) {
    console.error('[admin/magazines GET] query failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Accept both camelCase (form) and snake_case (API standard)
  const pubRaw = str(raw.publication);
  const publication = PUB_ALIAS[pubRaw.toLowerCase()];
  if (!publication) {
    return NextResponse.json({ error: 'invalid publication' }, { status: 400 });
  }

  const year = Number(raw.year);
  const month = Number(raw.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'invalid year' }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'invalid month' }, { status: 400 });
  }

  // issue_label or issuelabel
  const issueLabel = str(raw.issue_label ?? raw.issuelabel);
  if (!issueLabel) {
    return NextResponse.json({ error: 'issue_label is required' }, { status: 400 });
  }

  // sort_date or sortdate
  const sortDateRaw = str(raw.sort_date ?? raw.sortdate);
  const sortDate = /^\d{4}-\d{2}-\d{2}/.test(sortDateRaw)
    ? sortDateRaw.slice(0, 10)
    : `${year}-${String(month).padStart(2, '0')}-01`;

  // cover_url or coverurl
  const coverUrl = str(raw.cover_url ?? raw.coverurl);
  if (!coverUrl) {
    return NextResponse.json({ error: 'cover_url is required' }, { status: 400 });
  }

  // reader_url or readerurl (optional)
  const readerUrlRaw = raw.reader_url ?? raw.readerurl;
  const readerUrl = readerUrlRaw != null ? str(readerUrlRaw) || null : null;

  // page_urls or pageurls
  const pageUrlsRaw = raw.page_urls ?? raw.pageurls;
  const pageUrls: string[] = Array.isArray(pageUrlsRaw) ? pageUrlsRaw : [];
  if (!pageUrls.every((u) => typeof u === 'string')) {
    return NextResponse.json({ error: 'page_urls must be string[]' }, { status: 400 });
  }

  // page_count or pagecount
  const pageCountRaw = raw.page_count ?? raw.pagecount;
  const pageCount =
    typeof pageCountRaw === 'number' && Number.isInteger(pageCountRaw) && pageCountRaw >= 0
      ? pageCountRaw
      : pageUrls.length;

  // page_texts or pagetexts (optional, stored as JSONB)
  const pageTextsRaw = raw.page_texts ?? raw.pagetexts;
  const pageTexts = Array.isArray(pageTextsRaw)
    ? JSON.stringify(pageTextsRaw)
    : '[]';

  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO magazines (
        publication, year, month, issue_label, sort_date,
        cover_url, reader_url, page_urls, page_count, page_texts
      ) VALUES (
        ${publication}, ${year}, ${month}, ${issueLabel}, ${sortDate},
        ${coverUrl}, ${readerUrl}, ${pageUrls}::text[], ${pageCount}, ${pageTexts}::jsonb
      )
      RETURNING id, publication, year, month, issue_label, sort_date,
                cover_url, reader_url, page_urls, page_count
    `;
    return NextResponse.json({ magazine: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    console.error('[admin/magazines POST] insert failed:', errMessage(err));
    return NextResponse.json(
      { error: 'database error', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
