// POST { invoice_ids: string[], advertiser_id: number }
// Moves invoices to a different client (advertiser). Bill-to details are left as is.
import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { invalidateInvoiceCheckoutSessions } from '@/lib/server/invoice-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { invoice_ids?: unknown; advertiser_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const ids = Array.isArray(body.invoice_ids) ? body.invoice_ids.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)) : [];
  const advertiserId = Number(body.advertiser_id);
  if (ids.length === 0 || !Number.isInteger(advertiserId) || advertiserId < 1) {
    return NextResponse.json({ error: 'invoice_ids and advertiser_id are required' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const moved = await withNeonTransaction(async (client) => {
      const adv = await client.query<{ id: number; name: string }>('SELECT id, name FROM advertisers WHERE id = $1', [advertiserId]);
      if (!adv.rows[0]) throw new Error('client not found');
      const out: Array<{ id: string; number: string | null; from: number | null; to: number }> = [];
      for (const id of ids) {
        const cur = await client.query<{ number: string | null; advertiser_id: number | null }>('SELECT number, advertiser_id FROM invoices WHERE id = $1 FOR UPDATE', [id]);
        const row = cur.rows[0];
        if (!row) throw new Error(`invoice ${id} not found`);
        if (row.advertiser_id === advertiserId) { out.push({ id, number: row.number, from: row.advertiser_id, to: advertiserId }); continue; }
        await invalidateInvoiceCheckoutSessions(client, id);
        const entry = { event: 'invoice_reassigned', timestamp: new Date().toISOString(), user_email: admin.email ?? null, fields: ['advertiser_id'], changes: { advertiser_id: { from: row.advertiser_id, to: advertiserId } } };
        // The agreement belongs to the previous client, so the link is cleared.
        await client.query(
          `UPDATE invoices SET advertiser_id = $2, agreement_id = NULL, stripe_payment_link_url = NULL,
                  audit_log = COALESCE(audit_log, '[]'::jsonb) || $3::jsonb, updated_at = NOW()
            WHERE id = $1`,
          [id, advertiserId, JSON.stringify(entry)],
        );
        out.push({ id, number: row.number, from: row.advertiser_id, to: advertiserId });
      }
      return { client: adv.rows[0], invoices: out };
    });
    for (const id of ids) revalidateInvoiceViews(id);
    return NextResponse.json({ ok: true, ...moved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
});
