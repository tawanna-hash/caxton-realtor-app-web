// app/api/admin/portal-form-assignments/route.ts
//
// POST — staff assigns an existing form to an advertiser.
// GET  — list assignments (optionally filtered by advertiser_id).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const advertiserId = req.nextUrl.searchParams.get('advertiser_id');
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = advertiserId
      ? await sql`
          SELECT a.*, f.title AS form_title, f.slug AS form_slug
          FROM portal_form_assignments a
          JOIN portal_forms f ON f.id = a.form_id
          WHERE a.advertiser_id = ${Number(advertiserId)}
          ORDER BY a.assigned_at DESC
        `
      : await sql`
          SELECT a.*, f.title AS form_title, f.slug AS form_slug
          FROM portal_form_assignments a
          JOIN portal_forms f ON f.id = a.form_id
          ORDER BY a.assigned_at DESC
          LIMIT 100
        `;
    return NextResponse.json({ assignments: rows });
  } catch (err) {
    return NextResponse.json({ error: 'list failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { form_id?: string; advertiser_id?: number; due_at?: string; notes?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const formId = body.form_id;
  const advertiserId = Number(body.advertiser_id);
  if (!formId || !UUID_RE.test(formId)) return NextResponse.json({ error: 'form_id required (uuid)' }, { status: 400 });
  if (!advertiserId || Number.isNaN(advertiserId)) return NextResponse.json({ error: 'advertiser_id required' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO portal_form_assignments (
        form_id, advertiser_id, status, assigned_by, due_at, notes
      ) VALUES (
        ${formId},
        ${advertiserId},
        'pending',
        ${admin.email ?? null},
        ${body.due_at ?? null},
        ${body.notes ?? null}
      )
      ON CONFLICT (form_id, advertiser_id) WHERE submitted_at IS NULL DO NOTHING
      RETURNING *
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'already assigned and not yet submitted' }, { status: 409 });
    }
    return NextResponse.json({ assignment: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'assign failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
