// app/api/admin/advertisers/industries/route.ts
//
// Returns the managed Industry picklist (from the advertiser_industries
// table) for the CRM contact panel's Industry dropdown. Active, non-archived
// labels ordered by sort_order. To add / reorder / archive options, edit the
// table directly.
//
// Auth: requireAdmin().

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureSchema, getSql } from '@/lib/db';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT label
      FROM advertiser_industries
     WHERE archived = false
     ORDER BY sort_order ASC, label ASC
  `) as unknown as Array<{ label: string }>;

  return NextResponse.json({ industries: rows.map((r) => r.label) });
}

// Add a new industry label to the picklist so it appears in the dropdown for
// every advertiser. Idempotent on label (ON CONFLICT DO NOTHING).
export const POST = withAdminTracking(async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label = typeof (body as { label?: unknown })?.label === 'string'
    ? (body as { label: string }).label.trim().slice(0, 80)
    : '';
  if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO advertiser_industries (label, sort_order)
    VALUES (${label}, 999)
    ON CONFLICT (label) DO NOTHING
  `;
  return NextResponse.json({ label });
});
