// app/api/admin/agreements/[id]/line-items/route.ts
//
// Returns the line items for a single agreement, newest-first by line_no.
// Used by the CRM "Current contract (Billing)" panel to render every line of
// a bundle (e.g. app Top Banner + e-Blast) instead of collapsing it to the
// single-line mirror columns on `advertisers`.
//
// Auth: requireAdmin().

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AgreementLineItem = {
  line_no: number;
  channel: string | null;
  package_label: string | null;
  ad_size: string | null;
  frequency: string | null;
  quantity: number | null;
  publication: string | null;
  start_date: string | null;
  end_date: string | null;
  preferred_send_dates: string[] | null;
  amount_cents: number | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT line_no, channel, package_label, ad_size, frequency, quantity,
           publication, start_date, end_date, amount_cents, preferred_send_dates
      FROM agreement_line_items
     WHERE agreement_id = ${id}
     ORDER BY line_no ASC
  `) as unknown as AgreementLineItem[];

  return NextResponse.json({ lineItems: rows });
}
