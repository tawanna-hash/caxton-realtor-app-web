import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' };

export type StripeTxn = {
  id: string; created: string; amount_cents: number; refunded_cents: number; fee_cents: number | null; net_cents: number | null;
  status: 'succeeded' | 'pending' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed';
  description: string | null; method: string; payer: string | null; failure: string | null; receipt_url: string | null;
  customer_id: string | null; partner_id: number | null; partner_name: string | null; agreement_id: string | null; payment_intent: string | null;
};

function methodOf(c: Stripe.Charge): string {
  const d = c.payment_method_details;
  if (d?.card) return `${d.card.funding === 'debit' ? 'Debit' : d.card.funding === 'prepaid' ? 'Prepaid' : 'Credit'} ${BRANDS[d.card.brand ?? ''] ?? d.card.brand} ••${d.card.last4}`;
  if (d?.us_bank_account) return `ACH ${d.us_bank_account.bank_name ?? 'bank'} ••${d.us_bank_account.last4}`;
  return d?.type ? d.type.replace(/_/g, ' ') : 'Unknown';
}
function statusOf(c: Stripe.Charge): StripeTxn['status'] {
  if (c.disputed) return 'disputed';
  if (c.status === 'failed') return 'failed';
  if (c.status === 'pending') return 'pending';
  if (c.refunded) return 'refunded';
  if (c.amount_refunded > 0) return 'partially_refunded';
  return 'succeeded';
}

// GET ?advertiser_id=<n>&starting_after=<ch_id>&limit=<=100&from=YYYY-MM-DD&to=YYYY-MM-DD
// Live read from Stripe, joined to partners by customer id or charge metadata. Admin only (middleware).
export async function GET(req: NextRequest) {
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  const u = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(u.get('limit')) || 50));
  const after = u.get('starting_after') || undefined;
  const advId = u.get('advertiser_id') ? Number(u.get('advertiser_id')) : null;
  const from = u.get('from') ? Math.floor(new Date(`${u.get('from')}T00:00:00`).getTime() / 1000) : undefined;
  const to = u.get('to') ? Math.floor(new Date(`${u.get('to')}T23:59:59`).getTime() / 1000) : undefined;
  await ensureSchema();
  const sql = getSql();
  const stripe = getStripe();
  const created = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  try {
    let charges: Stripe.Charge[] = []; let hasMore = false;
    if (advId != null) {
      const rows = (await sql`SELECT stripe_customer_id AS c FROM advertisers WHERE id = ${advId} AND stripe_customer_id IS NOT NULL
        UNION SELECT stripe_customer_id FROM agreements WHERE advertiser_id = ${advId} AND stripe_customer_id IS NOT NULL`) as unknown as Array<{ c: string }>;
      const ids = [...new Set(rows.map((r) => r.c))];
      const lists = await Promise.all(ids.map((customer) => stripe.charges.list({ customer, limit, created, expand: ['data.balance_transaction'] })));
      charges = lists.flatMap((l) => l.data).sort((a, b) => b.created - a.created).slice(0, limit);
      hasMore = lists.some((l) => l.has_more);
    } else {
      const l = await stripe.charges.list({ limit, starting_after: after, created, expand: ['data.balance_transaction'] });
      charges = l.data; hasMore = l.has_more;
    }
    const custIds = [...new Set(charges.map((c) => (typeof c.customer === 'string' ? c.customer : c.customer?.id)).filter(Boolean))] as string[];
    const agIds = [...new Set(charges.map((c) => c.metadata?.agreement_id).filter(Boolean))] as string[];
    const byCust = new Map<string, { id: number; name: string }>();
    if (custIds.length) {
      const r = (await sql`SELECT id, name, stripe_customer_id AS c FROM advertisers WHERE stripe_customer_id = ANY(${custIds})`) as unknown as Array<{ id: number; name: string; c: string }>;
      r.forEach((x) => byCust.set(x.c, { id: x.id, name: x.name }));
      const r2 = (await sql`SELECT a.id, a.name, g.stripe_customer_id AS c FROM agreements g JOIN advertisers a ON a.id = g.advertiser_id WHERE g.stripe_customer_id = ANY(${custIds})`) as unknown as Array<{ id: number; name: string; c: string }>;
      r2.forEach((x) => { if (!byCust.has(x.c)) byCust.set(x.c, { id: x.id, name: x.name }); });
    }
    const byAg = new Map<string, { id: number; name: string }>();
    if (agIds.length) {
      const r = (await sql`SELECT g.id::text AS gid, a.id, a.name FROM agreements g JOIN advertisers a ON a.id = g.advertiser_id WHERE g.id::text = ANY(${agIds})`) as unknown as Array<{ gid: string; id: number; name: string }>;
      r.forEach((x) => byAg.set(x.gid, { id: x.id, name: x.name }));
    }
    const rows: StripeTxn[] = charges.map((c) => {
      const cust = typeof c.customer === 'string' ? c.customer : c.customer?.id ?? null;
      const bt = c.balance_transaction && typeof c.balance_transaction !== 'string' ? c.balance_transaction : null;
      const p = (cust && byCust.get(cust)) || (c.metadata?.agreement_id && byAg.get(c.metadata.agreement_id)) || null;
      return {
        id: c.id, created: new Date(c.created * 1000).toISOString(), amount_cents: c.amount, refunded_cents: c.amount_refunded,
        fee_cents: bt ? bt.fee : null, net_cents: bt ? bt.net : null, status: statusOf(c), description: c.description,
        method: methodOf(c), payer: c.billing_details?.name ?? c.billing_details?.email ?? null, failure: c.failure_message,
        receipt_url: c.receipt_url, customer_id: cust, partner_id: p?.id ?? null, partner_name: p?.name ?? null,
        agreement_id: c.metadata?.agreement_id ?? null, payment_intent: typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id ?? null,
      };
    });
    return NextResponse.json({ transactions: rows, has_more: hasMore, next: rows.length ? rows[rows.length - 1].id : null });
  } catch (err) {
    console.error('[admin/stripe/transactions]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load Stripe transactions.' }, { status: 502 });
  }
}
