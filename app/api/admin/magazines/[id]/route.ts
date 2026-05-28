// app/api/admin/magazines/[id]/route.ts
//
// GET, PATCH, DELETE for a single magazine row.

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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

// Minimal type for neon's query function — covers what we use.
type NeonQueryFn = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;
type NeonClient = {
  query?: NeonQueryFn;
};

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, publication, year, month, issue_label,
             cover_url, reader_url, page_urls, page_texts, page_count, sort_date
      FROM magazines
      WHERE id = ${idNum}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ magazine: rows[0] });
  } catch (err: unknown) {
    console.error('[admin/magazines/[id] GET] failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: { col: string; val: unknown }[] = [];

  if (body.publication != null) {
    const pub = PUB_ALIAS[String(body.publication).toLowerCase()];
    if (!pub) {
      return NextResponse.json({ error: 'invalid publication' }, { status: 400 });
    }
    updates.push({ col: 'publication', val: pub });
  }
  if (body.year != null) {
    const y = Number(body.year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return NextResponse.json({ error: 'invalid year' }, { status: 400 });
    }
    updates.push({ col: 'year', val: y });
  }
  if (body.month != null) {
    const m = Number(body.month);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: 'invalid month' }, { status: 400 });
    }
    updates.push({ col: 'month', val: m });
  }
  if (body.issue_label != null) {
    const lbl = String(body.issue_label).trim();
    if (!lbl) {
      return NextResponse.json({ error: 'invalid issue_label' }, { status: 400 });
    }
    updates.push({ col: 'issue_label', val: lbl });
  }
  if (body.sort_date != null) {
    const sd = String(body.sort_date);
    if (!/^\d{4}-\d{2}-\d{2}/.test(sd)) {
      return NextResponse.json({ error: 'invalid sort_date' }, { status: 400 });
    }
    updates.push({ col: 'sort_date', val: sd.slice(0, 10) });
  }
  if (body.cover_url !== undefined) {
    updates.push({ col: 'cover_url', val: body.cover_url || null });
  }
  if (body.reader_url !== undefined) {
    updates.push({ col: 'reader_url', val: body.reader_url || null });
  }
  if (body.page_urls !== undefined) {
    if (!Array.isArray(body.page_urls)) {
      return NextResponse.json({ error: 'page_urls must be an array' }, { status: 400 });
    }
    updates.push({ col: 'page_urls', val: body.page_urls });
    if (body.page_count === undefined) {
      updates.push({ col: 'page_count', val: body.page_urls.length });
    }
  }
  if (body.page_count !== undefined) {
    const pc = Number(body.page_count);
    if (!Number.isInteger(pc) || pc < 0) {
      return NextResponse.json({ error: 'invalid page_count' }, { status: 400 });
    }
    updates.push({ col: 'page_count', val: pc });
  }
  if (body.page_texts !== undefined) {
    if (!Array.isArray(body.page_texts)) {
      return NextResponse.json({ error: 'page_texts must be an array' }, { status: 400 });
    }
    updates.push({ col: 'page_texts', val: JSON.stringify(body.page_texts) });
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'no updatable fields provided' }, { status: 400 });
  }

  try {
    const sql = getSql() as unknown as NeonClient;
    if (!sql.query) {
      return NextResponse.json(
        { error: 'sql.query() not available on this neon client version' },
        { status: 500 },
      );
    }
    // Column names are literal strings we control (never user-supplied), so
    // concatenating them into the SQL is safe. Values go through parameters.
    const setFragments = updates.map((u, i) => `${u.col} = $${i + 1}`).join(', ');
    const params: unknown[] = [...updates.map((u) => u.val), idNum];
    const queryText = `
      UPDATE magazines
      SET ${setFragments}, updated_at = NOW()
      WHERE id = $${updates.length + 1}
      RETURNING id, publication, year, month, issue_label,
                cover_url, reader_url, page_urls, page_texts, page_count, sort_date
    `;
    const result = await sql.query(queryText, params);
    return NextResponse.json({ magazine: result[0] });
  } catch (err: unknown) {
    const msg = errMessage(err);
    console.error('[admin/magazines/[id] PATCH] failed:', msg);
    return NextResponse.json({ error: 'database error', detail: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    const sql = getSql();
    const rows = await sql`DELETE FROM magazines WHERE id = ${idNum} RETURNING id`;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: rows[0].id });
  } catch (err: unknown) {
    console.error('[admin/magazines/[id] DELETE] failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
