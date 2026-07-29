// app/api/admin/mailing/tags/route.ts
//
// Tag library admin API.
//
// GET    /api/admin/mailing/tags
//   Returns every distinct tag found across mailing_contacts, advertisers,
//   and realtors, with row counts per source. Used by the Manage Tags page
//   to render the tag table.
//
// POST   /api/admin/mailing/tags
//   Body: { action: 'rename' | 'merge' | 'delete', from: string | string[], to?: string }
//     - rename: rename tag `from` (string) to `to` everywhere
//     - merge:  remove every tag in `from` (string[]) and add `to`
//     - delete: strip tag `from` (string) from every row
//   All operations are idempotent and run across all 3 tables in one txn-ish
//   sequence (Neon single-statement, but each statement uses jsonb_agg DISTINCT
//   so re-runs are safe).
//
// Affects:
//   mailing_contacts.tags  (all stages, all segments)
//   advertisers.tags
//   realtors.tags

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TagCountRow = {
  tag: string;
  mailing_contacts: number;
  advertisers: number;
  realtors: number;
  total: number;
};

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureSchema();
  const sql = getSql();

  const rows = (await sql.query(
    `WITH mc AS (
       SELECT t AS tag, count(*)::int AS n
         FROM mailing_contacts, jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb)) AS t
        GROUP BY t
     ),
     adv AS (
       SELECT t AS tag, count(*)::int AS n
         FROM advertisers, jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb)) AS t
        GROUP BY t
     ),
     rlt AS (
       SELECT t AS tag, count(*)::int AS n
         FROM realtors, jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb)) AS t
        GROUP BY t
     ),
     all_tags AS (
       SELECT tag FROM mc UNION SELECT tag FROM adv UNION SELECT tag FROM rlt
     )
     SELECT at.tag,
            COALESCE(mc.n, 0)  AS mailing_contacts,
            COALESCE(adv.n, 0) AS advertisers,
            COALESCE(rlt.n, 0) AS realtors,
            COALESCE(mc.n, 0) + COALESCE(adv.n, 0) + COALESCE(rlt.n, 0) AS total
       FROM all_tags at
       LEFT JOIN mc  ON mc.tag  = at.tag
       LEFT JOIN adv ON adv.tag = at.tag
       LEFT JOIN rlt ON rlt.tag = at.tag
      ORDER BY total DESC, at.tag ASC`,
  )) as TagCountRow[];

  return NextResponse.json({ tags: rows });
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const action = body.action;
  await ensureSchema();
  const sql = getSql();

  if (action === 'rename') {
    const from = typeof body.from === 'string' ? body.from.trim() : '';
    const to   = typeof body.to   === 'string' ? body.to.trim()   : '';
    if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });
    if (from === to)  return NextResponse.json({ ok: true, changed: 0 });

    // Add `to` to every row that has `from`, then strip `from`.
    const tables = ['mailing_contacts', 'advertisers', 'realtors'];
    const results: Record<string, { added: number; removed: number }> = {};
    for (const table of tables) {
      // Add `to`
      const added = (await sql.query(
        `WITH affected AS (
           SELECT id FROM ${table} WHERE tags @> $1::jsonb
         ),
         upd AS (
           UPDATE ${table}
              SET tags = COALESCE((
                      SELECT jsonb_agg(DISTINCT t)
                        FROM jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb) || $2::jsonb) AS t
                    ), '[]'::jsonb),
                  updated_at = now()
            WHERE id IN (SELECT id FROM affected)
              AND NOT (tags @> $2::jsonb)
            RETURNING id
         )
         SELECT count(*)::int AS n FROM upd`,
        [JSON.stringify([from]), JSON.stringify([to])],
      )) as Array<{ n: number }>;

      // Remove `from`
      const removed = (await sql.query(
        `WITH upd AS (
           UPDATE ${table}
              SET tags = COALESCE((
                      SELECT jsonb_agg(t)
                        FROM jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb)) AS t
                       WHERE t <> $1
                    ), '[]'::jsonb),
                  updated_at = now()
            WHERE tags @> $2::jsonb
            RETURNING id
         )
         SELECT count(*)::int AS n FROM upd`,
        [from, JSON.stringify([from])],
      )) as Array<{ n: number }>;

      results[table] = { added: added[0]?.n ?? 0, removed: removed[0]?.n ?? 0 };
    }
    return NextResponse.json({ ok: true, action: 'rename', from, to, results });
  }

  if (action === 'delete') {
    const from = typeof body.from === 'string' ? body.from.trim() : '';
    if (!from) return NextResponse.json({ error: 'from required' }, { status: 400 });

    const tables = ['mailing_contacts', 'advertisers', 'realtors'];
    const results: Record<string, number> = {};
    for (const table of tables) {
      const r = (await sql.query(
        `WITH upd AS (
           UPDATE ${table}
              SET tags = COALESCE((
                      SELECT jsonb_agg(t)
                        FROM jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb)) AS t
                       WHERE t <> $1
                    ), '[]'::jsonb),
                  updated_at = now()
            WHERE tags @> $2::jsonb
            RETURNING id
         )
         SELECT count(*)::int AS n FROM upd`,
        [from, JSON.stringify([from])],
      )) as Array<{ n: number }>;
      results[table] = r[0]?.n ?? 0;
    }
    return NextResponse.json({ ok: true, action: 'delete', from, results });
  }

  if (action === 'merge') {
    const fromList = Array.isArray(body.from)
      ? (body.from as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((s) => s.trim())
      : [];
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    if (fromList.length === 0 || !to) {
      return NextResponse.json({ error: 'from[] and to required' }, { status: 400 });
    }

    const tables = ['mailing_contacts', 'advertisers', 'realtors'];
    const results: Record<string, { added: number; removed: number }> = {};
    for (const table of tables) {
      // Add `to` everywhere any of fromList tags exist
      const added = (await sql.query(
        `WITH upd AS (
           UPDATE ${table}
              SET tags = COALESCE((
                      SELECT jsonb_agg(DISTINCT t)
                        FROM jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb) || $2::jsonb) AS t
                    ), '[]'::jsonb),
                  updated_at = now()
            WHERE tags ?| $1::text[]
              AND NOT (tags @> $2::jsonb)
            RETURNING id
         )
         SELECT count(*)::int AS n FROM upd`,
        [fromList, JSON.stringify([to])],
      )) as Array<{ n: number }>;

      // Strip every tag in fromList (but never strip `to` itself if it's in the list)
      const stripList = fromList.filter((t) => t !== to);
      let removed = 0;
      if (stripList.length > 0) {
        const r = (await sql.query(
          `WITH upd AS (
             UPDATE ${table}
                SET tags = COALESCE((
                        SELECT jsonb_agg(t)
                          FROM jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb)) AS t
                         WHERE t <> ALL($1::text[])
                      ), '[]'::jsonb),
                    updated_at = now()
              WHERE tags ?| $1::text[]
              RETURNING id
           )
           SELECT count(*)::int AS n FROM upd`,
          [stripList],
        )) as Array<{ n: number }>;
        removed = r[0]?.n ?? 0;
      }

      results[table] = { added: added[0]?.n ?? 0, removed };
    }
    return NextResponse.json({ ok: true, action: 'merge', from: fromList, to, results });
  }

  if (action === 'add') {
    // Apply a tag to a list of contact ids (mailing_contacts only).
    const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
    const ids = Array.isArray(body.ids)
      ? (body.ids as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    if (!tag || ids.length === 0) {
      return NextResponse.json({ error: 'tag and ids[] required' }, { status: 400 });
    }
    const r = (await sql.query(
      `WITH upd AS (
         UPDATE mailing_contacts
            SET tags = COALESCE((
                    SELECT jsonb_agg(DISTINCT t)
                      FROM jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb) || $2::jsonb) AS t
                  ), '[]'::jsonb),
                updated_at = now()
          WHERE id = ANY($1::uuid[])
            AND NOT (tags @> $2::jsonb)
          RETURNING id
       )
       SELECT count(*)::int AS n FROM upd`,
      [ids, JSON.stringify([tag])],
    )) as Array<{ n: number }>;
    return NextResponse.json({ ok: true, action: 'add', tag, updated: r[0]?.n ?? 0 });
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 });
});
