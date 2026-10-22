// Client file: Payment Method Setup history.
//   GET ?ids=1,2           -> entries for the client (merged records), newest first (no email body)
//   GET ?entry=<logId>     -> one entry including the copy of the sent email (html)
import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensurePaymentSetupSchema } from '@/lib/server/payment-setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const base = Number(id);
  if (!Number.isInteger(base) || base <= 0) return NextResponse.json({ error: 'Invalid client' }, { status: 400 });
  const ids = [base, ...(req.nextUrl.searchParams.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)].slice(0, 25);
  await ensurePaymentSetupSchema();
  const sql = getSql();

  const entry = req.nextUrl.searchParams.get('entry');
  if (entry) {
    const rows = await sql`
      SELECT id::text, event, created_at, actor, from_email, to_emails, cc_emails, subject, html
        FROM client_payment_setup_log WHERE id = ${Number(entry)} AND advertiser_id = ANY(${ids})`;
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ entry: rows[0] });
  }

  const rows = await sql`
    SELECT id::text, advertiser_id, event, created_at, actor, market, from_email, to_emails, cc_emails, subject,
           (html IS NOT NULL) AS has_copy, setup_url, link_expires_at, agreement_id, method_label, method_last4, details
      FROM client_payment_setup_log
     WHERE advertiser_id = ANY(${ids})
     ORDER BY created_at DESC
     LIMIT 200`;
  return NextResponse.json({ entries: rows });
}
