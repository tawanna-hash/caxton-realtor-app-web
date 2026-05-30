// app/api/portal/form-assignments/[id]/submit/route.ts
//
// POST — advertiser submits answers. Validates the bearer (portal session),
//        owns the assignment, persists answers + status='submitted'.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import type { PortalFormSchema } from '@/lib/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: { answers?: Record<string, unknown> };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const answers = (body.answers ?? {}) as Record<string, unknown>;

  try {
    await ensureSchema();
    const sql = getSql();

    // Confirm ownership and not already submitted; fetch schema for validation.
    const rows = (await sql`
      SELECT a.id, a.advertiser_id, a.submitted_at, f.schema
      FROM portal_form_assignments a
      JOIN portal_forms f ON f.id = a.form_id
      WHERE a.id = ${id}
    `) as unknown as {
      id: string;
      advertiser_id: number;
      submitted_at: string | null;
      schema: PortalFormSchema;
    }[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const row = rows[0];
    if (row.advertiser_id !== user.advertiser_id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (row.submitted_at) {
      return NextResponse.json({ error: 'already submitted' }, { status: 409 });
    }

    // Validate required fields
    const schema = row.schema ?? { fields: [] };
    for (const field of schema.fields ?? []) {
      if (!field.required) continue;
      const v = answers[field.key];
      if (typeof v !== 'string' || !v.trim()) {
        return NextResponse.json({ error: `missing required field: ${field.key}` }, { status: 400 });
      }
    }

    // Coerce to a flat string/number map (we don't accept arbitrary jsonb)
    const clean: Record<string, string | number | boolean | null> = {};
    for (const field of schema.fields ?? []) {
      const v = answers[field.key];
      if (v == null) { clean[field.key] = null; continue; }
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        clean[field.key] = v;
      } else {
        clean[field.key] = String(v);
      }
    }

    await sql`
      UPDATE portal_form_assignments
      SET answers = ${JSON.stringify(clean)}::jsonb,
          status = 'submitted',
          submitted_at = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'submit failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
