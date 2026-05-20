// app/api/admin/magazines/route.ts
//
// Admin CRUD for magazines (list + create).
//
//   GET  /api/admin/magazines           — list all, newest first
//   POST /api/admin/magazines           — create new row with metadata; file
//                                          URLs attach later via PATCH

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
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

const PUB_ALIAS: Record<string, string> = {
  realtyline: 'austin',
  newsline: 'san_antonio',
  austin: 'austin',
  san_antonio: 'san_antonio',
};

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

  let body: {
    publication?: string;
    year?: number;
    month?: number;
    issue_label?: string;
    sort_date?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const publication = PUB_ALIAS[String(body.publication || '').toLowerCase()];
  if (!publication) {
    return NextResponse.json({ error: 'invalid publication' }, { status: 400 });
  }
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'invalid year' }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'invalid month' }, { status: 400 });
  }
  const issueLabel = String(body.issue_label || '').trim();
  if (!issueLabel) {
    return NextResponse.json({ error: 'issue_label is required' }, { status: 400 });
  }
  const sortDate =
    body.sort_date && /^\d{4}-\d{2}-\d{2}/.test(body.sort_date)
      ? body.sort_date.slice(0, 10)
      : `${year}-${String(month).padStart(2, '0')}-01`;

  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO magazines (
        publication, year, month, issue_label, sort_date, page_count, page_urls
      ) VALUES (
        ${publication}, ${year}, ${month}, ${issueLabel}, ${sortDate}, 0, ${[]}::text[]
      )
      RETURNING id, publication, year, month, issue_label, sort_date
    `;
    return NextResponse.json({ magazine: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    console.error('[admin/magazines POST] insert failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
