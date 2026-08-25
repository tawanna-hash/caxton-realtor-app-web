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
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getSql } from '@/lib/db';
import { isPubId } from '@/lib/publications';

export const runtime = 'nodejs';

const ALLOWED_STATUS = new Set(['active', 'unsubscribed']);
const ALLOWED_VERIFIED = new Set(['valid','invalid','risky','unknown','pending','unverified']);

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);

  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get('pageSize') || '50') || 50),
  );

  const pubParam = url.searchParams.get('publication') || '';
  const publication = isPubId(pubParam) ? pubParam : null;

  const statusParam = url.searchParams.get('status') || '';
  const status = ALLOWED_STATUS.has(statusParam) ? statusParam : null;

  const qRaw = (url.searchParams.get('q') || '').trim().toLowerCase();
  const q = qRaw ? `%${qRaw}%` : null;

  const verifiedParam = url.searchParams.get('verified') || '';
  const verified = ALLOWED_VERIFIED.has(verifiedParam) ? verifiedParam : null;

  if (qRaw.length > 254) throw new ApiError(400, 'q too long');

  const SORT_ALLOW = new Set(['created_at', 'email', 'publication', 'source', 'status']);
  const sortParam = (url.searchParams.get('sort') || 'created_at').toLowerCase();
  const sort = SORT_ALLOW.has(sortParam) ? sortParam : 'created_at';
  const dir = (url.searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const offset = (page - 1) * pageSize;
  const sql = getSql();

  // We use coalesced predicates so the same parameterized query handles
  // every combination of filters.
  // LEFT JOIN the unified email_verifications lookup so the UI can render
  // a colored status badge alongside each row's email.
  const rows = (await sql.query(
    `SELECT n.id, n.email, n.publication, n.source, n.status, n.created_at, n.updated_at,
            ev.status      AS email_verification_status,
            ev.sub_status  AS email_verification_reason,
            ev.verified_at AS email_verified_at
     FROM newsletter_subscribers n
     LEFT JOIN email_verifications ev ON ev.email = lower(n.email)
     WHERE ($1::text IS NULL OR n.publication = $1)
       AND ($2::text IS NULL OR n.status = $2)
       AND ($3::text IS NULL OR n.email ILIKE $3)
       AND (
             $6::text IS NULL
         OR ($6 = 'unverified' AND ev.status IS NULL)
         OR ($6 <> 'unverified' AND ev.status = $6)
       )
     ORDER BY n.${sort} ${dir} NULLS LAST, n.id ASC
     LIMIT $4 OFFSET $5`,
    [publication, status, q, pageSize, offset, verified],
  )) as Array<{
    id: number;
    email: string;
    publication: string;
    source: string;
    status: string;
    created_at: string;
    updated_at: string;
    email_verification_status: string | null;
    email_verification_reason: string | null;
    email_verified_at: string | null;
  }>;

  const countRows = (await sql.query(
    `SELECT COUNT(*)::int AS total
     FROM newsletter_subscribers n
     LEFT JOIN email_verifications ev ON ev.email = lower(n.email)
     WHERE ($1::text IS NULL OR n.publication = $1)
       AND ($2::text IS NULL OR n.status = $2)
       AND ($3::text IS NULL OR n.email ILIKE $3)
       AND (
             $4::text IS NULL
         OR ($4 = 'unverified' AND ev.status IS NULL)
         OR ($4 <> 'unverified' AND ev.status = $4)
       )`,
    [publication, status, q, verified],
  )) as Array<{ total: number }>;

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
