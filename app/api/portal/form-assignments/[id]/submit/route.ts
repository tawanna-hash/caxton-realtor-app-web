// app/api/portal/form-assignments/[id]/submit/route.ts
//
// POST — advertiser submits answers. Validates the bearer (portal session),
//        owns the assignment, persists answers + status='submitted'.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import type { PortalFormSchema } from '@/lib/portal';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { idParamSchema } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

// Accept any record of unknown — we coerce per-field below using the form schema.
const submitBodySchema = z.object({
  answers: z.record(z.string(), z.unknown()).default({}),
});

export const POST = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { id } = idParamSchema.parse(await ctx.params);
  const { answers } = submitBodySchema.parse(await req.json());

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
  if (rows.length === 0) throw new ApiError(404, 'not found');
  const row = rows[0];
  if (row.advertiser_id !== user.advertiser_id) {
    throw new ApiError(403, 'forbidden');
  }
  if (row.submitted_at) {
    throw new ApiError(409, 'already submitted');
  }

  // Validate required fields
  const schema = row.schema ?? { fields: [] };
  for (const field of schema.fields ?? []) {
    if (!field.required) continue;
    const v = answers[field.key];
    if (typeof v !== 'string' || !v.trim()) {
      throw new ApiError(400, `missing required field: ${field.key}`);
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
});
