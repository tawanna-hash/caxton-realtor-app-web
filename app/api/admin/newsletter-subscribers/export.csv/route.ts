/**
 * GET /api/admin/newsletter-subscribers/export.csv
 *
 * Streams the full filtered list of newsletter_subscribers as CSV.
 * Honors the same filters as the list endpoint (publication, status, q).
 */

import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';

const ALLOWED_PUBS = new Set(['realtyline', 'newsline']);
const ALLOWED_STATUS = new Set(['active', 'unsubscribed']);

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);

  const pubParam = url.searchParams.get('publication') || '';
  const publication = ALLOWED_PUBS.has(pubParam) ? pubParam : null;

  const statusParam = url.searchParams.get('status') || '';
  const status = ALLOWED_STATUS.has(statusParam) ? statusParam : null;

  const qRaw = (url.searchParams.get('q') || '').trim().toLowerCase();
  const q = qRaw ? `%${qRaw}%` : null;
  if (qRaw.length > 254) throw new ApiError(400, 'q too long');

  const sql = getSql();
  const rows = (await sql`
    SELECT id, email, publication, source, status, created_at
    FROM newsletter_subscribers
    WHERE (${publication}::text IS NULL OR publication = ${publication})
      AND (${status}::text IS NULL OR status = ${status})
      AND (${q}::text IS NULL OR email ILIKE ${q})
    ORDER BY created_at DESC
  `) as Array<{
    id: number;
    email: string;
    publication: string;
    source: string;
    status: string;
    created_at: string;
  }>;

  const header = ['id', 'email', 'publication', 'source', 'status', 'created_at'];
  const lines: string[] = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(String(r.id)),
        csvEscape(r.email),
        csvEscape(r.publication),
        csvEscape(r.source),
        csvEscape(r.status),
        csvEscape(r.created_at),
      ].join(','),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const body = lines.join('\n') + '\n';

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="newsletter_subscribers_${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
