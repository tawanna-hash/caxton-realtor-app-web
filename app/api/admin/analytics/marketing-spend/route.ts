// app/api/admin/analytics/marketing-spend/route.ts
//
// Monthly marketing spend by channel (feeds CAC / ROAS / CPL on
// /admin/marketing-performance).
//
// GET    — list entries
// POST   — upsert { month: 'YYYY-MM', channel, amount_cents, notes? }
// DELETE — ?id=<uuid>

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseJson } from '@/lib/server/schemas/_common';
import { ApiError } from '@/lib/server/error';
import { query } from '@/lib/server/db/neon';
import { CHANNELS, ensureMarketingSpendSchema, fetchSpendEntries } from '@/lib/server/marketing-performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const spendSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
  channel: z.enum(CHANNELS),
  amount_cents: z.coerce.number().int().min(0).max(2_000_000_000),
  notes: z.string().trim().max(500).optional().nullable(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const entries = await fetchSpendEntries();
  return NextResponse.json({ ok: true, entries });
});

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseJson(req, spendSchema);
  await ensureMarketingSpendSchema();
  const createdBy = admin.email ?? null;
  const rows = await query<{ id: string }>(
    `INSERT INTO marketing_spend (month, channel, amount_cents, notes, created_by)
     VALUES ($1::date, $2, $3, $4, $5)
     ON CONFLICT (month, channel)
     DO UPDATE SET amount_cents = EXCLUDED.amount_cents,
                   notes        = EXCLUDED.notes,
                   updated_at   = now()
     RETURNING id`,
    [`${body.month}-01`, body.channel, body.amount_cents, body.notes || null, createdBy],
  );
  return NextResponse.json({ ok: true, id: rows[0]?.id });
});

export const DELETE = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid id');
  await ensureMarketingSpendSchema();
  await query(`DELETE FROM marketing_spend WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
});
