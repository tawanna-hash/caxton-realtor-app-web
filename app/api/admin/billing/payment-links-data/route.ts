// Invoices and advertisers for the Billing > Payment links tab. Same data the
// Get Paid payment links page loaded on the server.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureSchema();
  const sql = getSql();
  const [invoices, advertisers] = await Promise.all([
    sql`SELECT i.*, adv.name AS advertiser_name, false AS is_overdue FROM invoices i LEFT JOIN advertisers adv ON adv.id = i.advertiser_id ORDER BY i.created_at DESC`.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication, contact_email, billing_email FROM advertisers ORDER BY name ASC`.catch(() => [] as unknown[]),
  ]);
  // The long remit-to memo and audit log are not used by the Payment links tab
  // and made up roughly half of this response; drop them.
  const slim = (invoices as Array<Record<string, unknown>>).map((r) => {
    const o = { ...r };
    delete o.memo;
    delete o.audit_log;
    return o;
  });
  return NextResponse.json({ invoices: slim, advertisers });
}
