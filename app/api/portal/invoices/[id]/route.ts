// app/api/portal/invoices/[id]/route.ts
//
// GET — advertiser (portal session) fetches their own invoice for the pay page.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { isStripeConfigured, getPublishableKey } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, number, status, amount_cents, tax_cents, total_cents,
             issued_at, due_date, paid_at, memo, line_items,
             bill_to_name, bill_to_email, bill_to_address, advertiser_id
      FROM invoices WHERE id = ${id}
    `) as unknown as Array<Record<string, unknown> & { advertiser_id: number | null }>;
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const inv = rows[0];
    if (inv.advertiser_id !== portalUser.advertiser_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const { advertiser_id: _drop, ...invoice } = inv;
    void _drop;
    return NextResponse.json({
      invoice,
      stripe_configured: isStripeConfigured(),
      stripe_publishable_key: getPublishableKey(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'lookup failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
}
