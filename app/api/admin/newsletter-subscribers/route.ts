/**
 * GET /api/admin/newsletter-subscribers
 *
 * Paginated list of newsletter_subscribers (email-only weekly digest signups
 * from the dashboard feed CTA). Distinct from the realtor /admin/subscribers
 * table which lives on the droplet.
 *
 * Query params:
 *   page        (default 1)
 *   pageSize    (default 50, max 200)
 *   publication 'realtyline' | 'newsline'
 *   status      'active' | 'unsubscribed'
 *   q           email substring (case-insensitive)
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';

const ALLOWED_PUBS = new Set(['realtyline', 'newsline']);
const ALLOWED_STATUS = new Set(['active', 'unsubscribed']);

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);

  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get('pageSize') || '50') || 50),
  );

  const pubParam = url.searchParams.get('publication') || '';
  const publication = ALLOWED_PUBS.has(pubParam) ? pubParam : null;

  const statusParam = url.searchParams.get('status') || '';
  const status = ALLOWED_STATUS.has(statusParam) ? statusParam : null;

  const qRaw = (url.searchParams.get('q') || '').trim().toLowerCase();
  const q = qRaw ? `%${qRaw}%` : null;

  if (qRaw.length > 254) throw new ApiError(400, 'q too long');

  const SORT_ALLOW = new Set(['created_at', 'email', 'publication', 'source', 'status']);
  const sortParam = (url.searchParams.get('sort') || 'created_at').toLowerCase();
  const sort = SORT_ALLOW.has(sortParam) ? sortParam : 'created_at';
  const dir = (url.searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const offset = (page - 1) * pageSize;
  const sql = getSql();

  // We use coalesced predicates so the same parameterized query handles
  // every combination of filters.
  const rows = (await sql.query(
    `SELECT id, email, publication, source, status, created_at, updated_at
     FROM newsletter_subscribers
     WHERE ($1::text IS NULL OR publication = $1)
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR email ILIKE $3)
     ORDER BY ${sort} ${dir} NULLS LAST, id ASC
     LIMIT $4 OFFSET $5`,
    [publication, status, q, pageSize, offset],
  )) as Array<{
    id: number;
    email: string;
    publication: string;
    source: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  const countRows = (await sql`
    SELECT COUNT(*)::int AS total
    FROM newsletter_subscribers
    WHERE (${publication}::text IS NULL OR publication = ${publication})
      AND (${status}::text IS NULL OR status = ${status})
      AND (${q}::text IS NULL OR email ILIKE ${q})
  `) as Array<{ total: number }>;

  const total = countRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages,
    subscribers: rows,
  });
});
